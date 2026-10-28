import { spawn } from "node:child_process";

const cwd = process.argv[2] ?? process.cwd();
const child = spawn("codex", ["app-server"], {
	cwd,
	env: process.env,
	stdio: ["pipe", "pipe", "ignore"],
});
let buffer = "";
const send = (message: unknown): void => {
	child.stdin.write(`${JSON.stringify(message)}\n`);
};
const timer = setTimeout(() => {
	child.kill();
	process.exit(1);
}, 30_000);

function hashesOf(reply: unknown): Record<string, string> {
	const data =
		typeof reply === "object" && reply !== null
			? Reflect.get(Reflect.get(reply, "result") ?? {}, "data")
			: undefined;
	const hooks = Array.isArray(data)
		? data.flatMap((entry: unknown) => {
				const list =
					typeof entry === "object" && entry !== null
						? Reflect.get(entry, "hooks")
						: undefined;
				return Array.isArray(list) ? list : [];
			})
		: [];
	return Object.fromEntries(
		hooks.flatMap((hook: unknown) => {
			if (typeof hook !== "object" || hook === null) return [];
			const key = Reflect.get(hook, "key");
			const hash = Reflect.get(hook, "currentHash");
			return typeof key === "string" && typeof hash === "string"
				? [[key, hash.split("/")[0] ?? hash]]
				: [];
		}),
	);
}

child.stdout.on("data", (chunk: Buffer) => {
	buffer += chunk.toString("utf8");
	for (let end = buffer.indexOf("\n"); end >= 0; end = buffer.indexOf("\n")) {
		const line = buffer.slice(0, end);
		buffer = buffer.slice(end + 1);
		let message: unknown;
		try {
			message = JSON.parse(line);
		} catch {
			continue;
		}
		const id =
			typeof message === "object" && message !== null
				? Reflect.get(message, "id")
				: undefined;
		if (id === 1) {
			send({ method: "initialized" });
			send({ id: 2, method: "hooks/list", params: { cwds: [cwd] } });
		}
		if (id === 2) {
			clearTimeout(timer);
			process.stdout.write(`${JSON.stringify(hashesOf(message))}\n`);
			child.kill();
			process.exit(0);
		}
	}
});

send({
	id: 1,
	method: "initialize",
	params: { clientInfo: { name: "astack-dist", version: "0" } },
});
