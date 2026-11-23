import fc from "fast-check";
import {
	grantCovers,
	type MergeGrant,
	NO_GRANT,
} from "../../src/astack/pr/grant.ts";

export const RUNS = { numRuns: 100 };

export const grant: fc.Arbitrary<MergeGrant> = fc.oneof(
	fc.constant(NO_GRANT),
	fc.constant<MergeGrant>({ kind: "any" }),
	fc
		.array(fc.integer({ min: 1, max: 20 }), { minLength: 1, maxLength: 4 })
		.map((numbers): MergeGrant => ({ kind: "prs", numbers })),
);

export function meaning(of: MergeGrant): readonly number[] {
	return Array.from({ length: 22 }, (_, n) => n).filter((n) =>
		grantCovers(of, n),
	);
}
