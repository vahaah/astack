import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import {
	loadSessionPrs,
	saveSessionPrs,
	sessionStore,
} from "../../src/astack/pr/session-prs.ts";
import { NO_SESSION_PRS, type SessionPrs } from "../../src/astack/pr/split.ts";
import { ok } from "../../src/astack/result.ts";
import { RUNS } from "./grants.ts";

const root = mkdtempSync(join(tmpdir(), "astack-session-prs-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const sessionPrs: fc.Arbitrary<SessionPrs> = fc.record({
	split: fc.boolean(),
	opens: fc.array(
		fc.record({
			root: fc.string(),
			repo: fc.string(),
			base: fc.string(),
			head: fc.string(),
		}),
		{ maxLength: 4 },
	),
});

describe("the session PR record", () => {
	test("[control:session-prs-roundtrip] a load gives the record of the last save, and a store with no state folder or no session id saves nothing", () => {
		const state = join(root, "state");
		const store = sessionStore({ ASTACK_STATE_DIR: state }, "s1");
		const none = [
			sessionStore({}, "s1"),
			sessionStore({ ASTACK_STATE_DIR: state }, undefined),
			sessionStore({ ASTACK_STATE_DIR: state }, "a/b"),
		];
		fc.assert(
			fc.property(sessionPrs, sessionPrs, (first, last) => {
				expect(saveSessionPrs(first, store)).toEqual(ok(undefined));
				expect(saveSessionPrs(last, store)).toEqual(ok(undefined));
				expect(loadSessionPrs(store)).toEqual(last);
				for (const empty of none) {
					expect(saveSessionPrs(last, empty)).toEqual(ok(undefined));
					expect(loadSessionPrs(empty)).toEqual(NO_SESSION_PRS);
				}
			}),
			RUNS,
		);
		expect(existsSync(join(state, "pr-sessions", "s1.json"))).toBe(true);
		expect(existsSync(join(state, "pr-sessions", "undefined.json"))).toBe(
			false,
		);
	});
});
