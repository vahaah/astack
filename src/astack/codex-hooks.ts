import { spawn } from "node:child_process";
import { accessSync, constants, statSync } from "node:fs";
import { delimiter, join } from "node:path";

export const CODEX_TRUST_STATUSES = [
	"managed",
	"untrusted",
	"trusted",
	"modified",
] as const;

export type CodexTrustStatus = (typeof CODEX_TRUST_STATUSES)[number];

export type CodexHook = {
	readonly key: string;
	readonly enabled: boolean;
	readonly trustStatus: CodexTrustStatus;
	readonly currentHash: string;
};

export type CodexHookError = {
	readonly path: string;
	readonly message: string;
};

export type CodexHookEntry = {
	readonly hooks: readonly CodexHook[];
	readonly errors: readonly CodexHookError[];
	readonly warnings: readonly string[];
};

export type CodexHookList = { readonly data: readonly CodexHookEntry[] };

export type CodexHooksRead =
	| { readonly kind: "listed"; readonly list: CodexHookList }
	| { readonly kind: "failed"; readonly cause: string };

const field = (value: unknown, key: string): unknown =>
	typeof value === "object" && value !== null
		? Reflect.get(value, key)
		: undefined;

function all<T>(
	value: unknown,
	parse: (item: unknown) => T | undefined,
): T[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const parsed: T[] = [];
	for (const item of value) {
		const one = parse(item);
		if (one === undefined) return undefined;
		parsed.push(one);
	}
	return parsed;
}

function trustStatus(value: unknown): CodexTrustStatus | undefined {
	return CODEX_TRUST_STATUSES.find((status) => status === value);
}

function hook(value: unknown): CodexHook | undefined {
	const key = field(value, "key");
	const enabled = field(value, "enabled");
	const status = trustStatus(field(value, "trustStatus"));
	const currentHash = field(value, "currentHash");
	return typeof key === "string" &&
		typeof enabled === "boolean" &&
		status !== undefined &&
		typeof currentHash === "string"
		? { key, enabled, trustStatus: status, currentHash }
		: undefined;
}

function hookError(value: unknown): CodexHookError | undefined {
	const path = field(value, "path");
	const message = field(value, "message");
	return typeof path === "string" && typeof message === "string"
		? { path, message }
		: undefined;
}

function entry(value: unknown): CodexHookEntry | undefined {
	const hooks = all(field(value, "hooks"), hook);
	const errors = all(field(value, "errors"), hookError);
	const warnings = all(field(value, "warnings"), (item) =>
		typeof item === "string" ? item : undefined,
	);
	return hooks && errors && warnings ? { hooks, errors, warnings } : undefined;
}

export function parseHookList(result: unknown): CodexHookList | undefined {
	const data = all(field(result, "data"), entry);
	return data === undefined ? undefined : { data };
}

export function onPath(
	command: string,
	path: string | undefined,
): string | undefined {
	return (path ?? "")
		.split(delimiter)
		.filter((dir) => dir !== "")
		.map((dir) => join(dir, command))
		.find((candidate) => {
			try {
				accessSync(candidate, constants.X_OK);
				return statSync(candidate).isFile();
			} catch {
				return false;
			}
		});
}

function rpcError(message: unknown): string | undefined {
	const error = field(message, "error");
	if (error === undefined) return undefined;
	const code = field(error, "code");
	const text = field(error, "message");
	return `${String(code)}: ${typeof text === "string" ? text : JSON.stringify(error)}`;
}

export function readCodexHooks(args: {
	readonly cwd: string;
	readonly env: Readonly<Record<string, string | undefined>>;
	readonly timeoutMs: number;
}): Promise<CodexHooksRead> {
	const codex = onPath("codex", args.env.PATH);
	if (codex === undefined)
		return Promise.resolve({ kind: "failed", cause: "no codex on PATH" });
	return new Promise((resolve) => {
		const child = spawn(codex, ["app-server"], {
			cwd: args.cwd,
			env: args.env,
			stdio: ["pipe", "pipe", "ignore"],
		});
		let settled = false;
		const finish = (result: CodexHooksRead): void => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			child.stdout.destroy();
			child.stdin.destroy();
			child.kill();
			child.unref();
			resolve(result);
		};
		const fail = (cause: string): void => finish({ kind: "failed", cause });
		const timer = setTimeout(
			() =>
				fail(
					`codex app-server gave no hooks/list reply in ${args.timeoutMs / 1000} s`,
				),
			args.timeoutMs,
		);
		const send = (message: unknown): void => {
			child.stdin.write(`${JSON.stringify(message)}\n`);
		};
		child.on("error", (error) =>
			fail(`codex app-server did not start: ${error.message}`),
		);
		child.on("close", (code, signal) =>
			fail(
				`codex app-server exited with ${code === null ? `signal ${signal}` : `code ${code}`} before the hooks/list reply`,
			),
		);
		// Node emits EPIPE here when codex exits first. The close handler gives that cause.
		child.stdin.on("error", () => {});
		let buffer = "";
		child.stdout.on("data", (chunk: Buffer) => {
			buffer += chunk.toString("utf8");
			for (
				let end = buffer.indexOf("\n");
				end >= 0 && !settled;
				end = buffer.indexOf("\n")
			) {
				const line = buffer.slice(0, end);
				buffer = buffer.slice(end + 1);
				let message: unknown;
				try {
					message = JSON.parse(line);
				} catch {
					continue;
				}
				const id = field(message, "id");
				const error = rpcError(message);
				if (id === 1 && error !== undefined)
					fail(`codex app-server answered initialize with error ${error}`);
				else if (id === 1) {
					send({ method: "initialized" });
					send({ id: 2, method: "hooks/list", params: { cwds: [args.cwd] } });
				} else if (id === 2 && error !== undefined)
					fail(`codex app-server answered hooks/list with error ${error}`);
				else if (id === 2) {
					const list = parseHookList(field(message, "result"));
					finish(
						list === undefined
							? {
									kind: "failed",
									cause:
										"the hooks/list reply has no trustStatus or enabled field that astack can read",
								}
							: { kind: "listed", list },
					);
				}
			}
		});
		send({
			id: 1,
			method: "initialize",
			params: { clientInfo: { name: "astack", version: "0" } },
		});
	});
}
