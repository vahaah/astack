import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { companionFrom, writable } from "../../scripts/lib/companion.ts";
import { sha256 } from "../../src/astack/deny-list.ts";
import {
	denyStore,
	readDenyList,
	writeDenyList,
} from "../../src/astack/deny-store.ts";
import { err, ok } from "../../src/astack/result.ts";
import { envWithoutCompanion } from "../child-env.ts";

const ROOT = resolve(import.meta.dir, "../..");
const root = mkdtempSync(join(tmpdir(), "astack-deny-store-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

let made = 0;
function fresh(name: string): string {
	const dir = join(root, `${name}-${made++}`);
	mkdirSync(dir, { recursive: true });
	return dir;
}

function companion(list: string): string {
	const dir = fresh("companion");
	mkdirSync(join(dir, "projects"));
	mkdirSync(join(dir, "deny"));
	writeFileSync(join(dir, "deny", "names.sha256"), list);
	return dir;
}

function deny(state: string, ...args: string[]) {
	const result = spawnSync(
		process.execPath,
		[join(ROOT, "scripts", "deny.ts"), ...args],
		{
			encoding: "utf8",
			env: { ...envWithoutCompanion(), ASTACK_STATE_DIR: state },
		},
	);
	return {
		status: result.status,
		stdout: result.stdout,
		stderr: result.stderr,
	};
}

describe("the state copy of the deny list", () => {
	test("[control:deny-list-roundtrip] a read gives the last write, none for no copy, and a DenyListStop for a bad line", () => {
		const state = fresh("state");
		const store = denyStore({ ASTACK_STATE_DIR: state });
		const path = join(state, "deny", "names.sha256");
		const [one, two] = [sha256("zorblax"), sha256("initech")];
		expect(readDenyList(store)).toEqual(ok({ kind: "none" }));
		expect(writeDenyList(new Set([one]), store)).toEqual(ok(undefined));
		expect(writeDenyList(new Set([one, two]), store)).toEqual(ok(undefined));
		expect(readDenyList(store)).toEqual(
			ok({ kind: "list", hashes: new Set([one, two]) }),
		);
		writeFileSync(path, `${one}\nzorblax\n`);
		expect(readDenyList(store)).toEqual(
			err({ path, message: "line 2 is not 64 lowercase hex characters" }),
		);
		expect(readDenyList(denyStore({}))).toEqual(ok({ kind: "none" }));
	});

	test("a copy that the hook cannot read gives a DenyListStop", () => {
		const state = fresh("state");
		mkdirSync(join(state, "deny", "names.sha256"), { recursive: true });
		const read = readDenyList(denyStore({ ASTACK_STATE_DIR: state }));
		expect(read.ok ? "read" : read.error.path).toBe(
			join(state, "deny", "names.sha256"),
		);
	});

	test("[control:deny-sync] deny add and deny sync write the state copy, and sync refuses the example companion", () => {
		const state = fresh("state");
		const copy = join(state, "deny", "names.sha256");
		const owner = companion(`${sha256("initech")}\n`);
		const list = join(owner, "deny", "names.sha256");
		expect(deny(state, "add", "zorblax", "--companion", owner)).toEqual({
			status: 0,
			stdout: `added hash ${sha256("zorblax").slice(0, 8)} to ${list}\nwrote 2 hash(es) to ${copy}\n`,
			stderr: "",
		});
		expect(readFileSync(copy, "utf8")).toBe(readFileSync(list, "utf8"));
		const other = companion(`${sha256("globex")}\n`);
		expect(deny(state, "sync", "--companion", other)).toEqual({
			status: 0,
			stdout: `wrote 1 hash(es) to ${copy}\n`,
			stderr: "",
		});
		expect(readFileSync(copy, "utf8")).toBe(`${sha256("globex")}\n`);
		const refusal = writable(companionFrom(undefined, {}));
		expect(deny(state, "sync")).toEqual({
			status: 1,
			stdout: "",
			stderr: `${refusal.ok ? "" : refusal.error}\n`,
		});
		expect(readFileSync(copy, "utf8")).toBe(`${sha256("globex")}\n`);
	});
});
