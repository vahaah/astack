import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { joinGrants, NO_GRANT } from "../../src/astack/pr/grant.ts";
import { grant, meaning, RUNS } from "./grants.ts";

describe("joinGrants is a monoid under grantCovers with NO_GRANT as its identity", () => {
	test("[control:grant-join-meaning] NO_GRANT covers no PR and is an identity, joinGrants is associative, and a join covers n when one side covers n", () => {
		expect(meaning(NO_GRANT)).toEqual([]);
		fc.assert(
			fc.property(grant, grant, grant, (a, b, c) => {
				expect(meaning(joinGrants(NO_GRANT, a))).toEqual(meaning(a));
				expect(meaning(joinGrants(a, NO_GRANT))).toEqual(meaning(a));
				expect(meaning(joinGrants(joinGrants(a, b), c))).toEqual(
					meaning(joinGrants(a, joinGrants(b, c))),
				);
				expect(meaning(joinGrants(a, b))).toEqual(
					[...new Set([...meaning(a), ...meaning(b)])].sort((x, y) => x - y),
				);
			}),
			RUNS,
		);
	});
});
