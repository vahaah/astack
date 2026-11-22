import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import recorded from "../fixtures/codex/hooks-list.json" with { type: "json" };

export type RecordedReply = typeof recorded;
type RecordedHook = RecordedReply["result"]["data"][number]["hooks"][number];

export function recordedReply(): RecordedReply {
	return structuredClone(recorded);
}

export function withHook(
	key: string,
	change: Partial<RecordedHook>,
): RecordedReply {
	const reply = recordedReply();
	for (const entry of reply.result.data)
		entry.hooks = entry.hooks.map((hook) =>
			hook.key === key ? { ...hook, ...change } : hook,
		);
	return reply;
}

export type FakeCodex =
	| { readonly kind: "reply"; readonly reply: RecordedReply }
	| {
			readonly kind: "error";
			readonly error: { readonly code: number; readonly message: string };
	  };

export function fakeCodex(dir: string, fake: FakeCodex): string {
	const answer =
		fake.kind === "reply"
			? { ...fake.reply, id: 2 }
			: { id: 2, error: fake.error };
	const script = `#!${process.execPath}
let initialized = false;
let buffer = "";
process.stdin.on("data", (chunk) => {
	buffer += chunk;
	for (let end = buffer.indexOf("\\n"); end >= 0; end = buffer.indexOf("\\n")) {
		const message = JSON.parse(buffer.slice(0, end));
		buffer = buffer.slice(end + 1);
		if (message.id === 1)
			setTimeout(() => {
				initialized = true;
				process.stdout.write(JSON.stringify({ id: 1, result: {} }) + "\\n");
			}, 50);
		if (message.id === 2) {
			if (!initialized) process.exit(3);
			process.stdout.write(${JSON.stringify(JSON.stringify(answer))} + "\\n");
		}
	}
});
`;
	writeFileSync(join(dir, "codex"), script);
	chmodSync(join(dir, "codex"), 0o755);
	return dir;
}
