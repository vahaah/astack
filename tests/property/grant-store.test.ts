import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { NO_GRANT } from "../../src/astack/pr/grant.ts";
import {
	type GrantStore,
	grantStore,
	loadGrant,
	saveGrant,
} from "../../src/astack/pr/grant-store.ts";
import { ok } from "../../src/astack/result.ts";
import { grant, meaning, RUNS } from "./grants.ts";

const root = mkdtempSync(join(tmpdir(), "astack-grant-store-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function loaded(store: GrantStore): readonly number[] {
	const read = loadGrant(store);
	return read.ok ? meaning(read.value) : [];
}

describe("the grant store", () => {
	test("[control:grant-store-roundtrip] a load gives the grant of the last save, two saves equal one, and a save of NO_GRANT deletes the file", () => {
		const store = grantStore({ ASTACK_STATE_DIR: join(root, "state") }, "s1");
		if (store.kind !== "file") throw new Error("the store has no file");
		fc.assert(
			fc.property(grant, grant, (first, last) => {
				expect(saveGrant(first, store)).toEqual(ok(undefined));
				expect(saveGrant(last, store)).toEqual(ok(undefined));
				expect(loaded(store)).toEqual(meaning(last));
				expect(saveGrant(last, store)).toEqual(ok(undefined));
				expect(loaded(store)).toEqual(meaning(last));
				expect(existsSync(store.path)).toBe(last.kind !== "none");
			}),
			RUNS,
		);
	});

	test("a store with no state folder or no session saves nothing and loads NO_GRANT", () => {
		for (const store of [
			grantStore({}, "s1"),
			grantStore({ ASTACK_STATE_DIR: join(root, "state") }, undefined),
			grantStore({ ASTACK_STATE_DIR: join(root, "state") }, "a/b"),
		]) {
			expect(store).toEqual({ kind: "none" });
			expect(saveGrant({ kind: "any" }, store)).toEqual(ok(undefined));
			expect(loadGrant(store)).toEqual(ok(NO_GRANT));
		}
	});

	test("[control:grant-save-fail] a save under a state path that is a file gives an error with the grant path", () => {
		const file = join(root, "state-file");
		writeFileSync(file, "");
		const store = grantStore({ ASTACK_STATE_DIR: file }, "s1");
		expect(saveGrant({ kind: "any" }, store)).toEqual({
			ok: false,
			error: {
				path: join(file, "merge-grants", "s1.json"),
				message: expect.stringContaining("ENOTDIR"),
			},
		});
		expect(loadGrant(store)).toEqual(ok(NO_GRANT));
	});
});
