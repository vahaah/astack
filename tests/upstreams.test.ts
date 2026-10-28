import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	UPSTREAM_NAMES,
	UPSTREAMS,
	type Upstream,
	type UpstreamName,
	upstreamLicense,
	upstreamOrigin,
} from "../scripts/lib/upstreams.ts";
import { SCANNED_UPSTREAMS } from "./upstream-runs.ts";

const root = join(import.meta.dir, "..");

type LockEntry = {
	readonly name: string;
	readonly repo: string;
	readonly path: string;
	readonly commit: string;
};

function isLockEntry(value: unknown): value is LockEntry {
	return (
		typeof value === "object" &&
		value !== null &&
		"name" in value &&
		typeof value.name === "string" &&
		"repo" in value &&
		typeof value.repo === "string" &&
		"path" in value &&
		typeof value.path === "string" &&
		"commit" in value &&
		typeof value.commit === "string"
	);
}

function frozenLock(name: UpstreamName): LockEntry {
	const lock: unknown = JSON.parse(
		readFileSync(join(root, "upstream/lock.json"), "utf8"),
	);
	const sources: unknown[] =
		typeof lock === "object" &&
		lock !== null &&
		"sources" in lock &&
		Array.isArray(lock.sources)
			? lock.sources
			: [];
	const entry = sources.filter(isLockEntry).find((item) => item.name === name);
	if (entry === undefined)
		throw new Error(`upstream/lock.json has no entry for ${name}`);
	return entry;
}

function frozenLicense(name: UpstreamName): string {
	return readFileSync(join(root, "upstream", name, "LICENSE"), "utf8");
}

describe("the upstream registry", () => {
	test("names each upstream whose text the run scan reads, and no other", () => {
		expect([...UPSTREAM_NAMES].sort()).toEqual([...SCANNED_UPSTREAMS].sort());
	});

	test.each(UPSTREAM_NAMES)(
		"%s: the copyright line equals the one of the frozen LICENSE",
		(name) => {
			const { copyright }: Upstream = UPSTREAMS[name];
			const line = frozenLicense(name)
				.split("\n")
				.find((entry) => entry.startsWith("Copyright "));
			expect(copyright).toBe(line ?? "no copyright line");
		},
	);

	test.each(UPSTREAM_NAMES)(
		"%s: the licence text equals the frozen LICENSE byte for byte",
		(name) => {
			expect(upstreamLicense(name)).toBe(frozenLicense(name));
		},
	);

	test.each(UPSTREAM_NAMES)(
		"%s: the repo, the path and the commit equal the frozen lock entry",
		(name) => {
			const { repo, path, commit }: Upstream = UPSTREAMS[name];
			const lock = frozenLock(name);
			expect({ repo, path, commit }).toEqual({
				repo: lock.repo,
				path: lock.path,
				commit: lock.commit,
			});
		},
	);

	test("the origin names the path of a subfolder upstream and its commit", () => {
		const lock = frozenLock("pstack");
		expect(upstreamOrigin("pstack")).toBe(
			`${lock.repo}, path ${lock.path}, commit ${lock.commit}`,
		);
	});

	test("the origin of an upstream at the repo root names no path", () => {
		const lock = frozenLock("mattpocock-skills");
		expect(upstreamOrigin("mattpocock-skills")).toBe(
			`${lock.repo}, commit ${lock.commit}`,
		);
	});
});
