import type { Verdict } from "../events.ts";

export type HookOutput = {
	readonly stdout: string;
	readonly stderr: string;
	readonly exit: 0 | 2;
};

export const SILENT: HookOutput = { stdout: "", stderr: "", exit: 0 };

export function block(reason: string): HookOutput {
	return { stdout: "", stderr: `${reason}\n`, exit: 2 };
}

export function encodeBase(verdict: Verdict): HookOutput {
	switch (verdict.kind) {
		case "allow":
		case "note":
			return SILENT;
		case "deny":
			return block(verdict.reason);
		case "continue":
			return block(verdict.prompt);
	}
}
