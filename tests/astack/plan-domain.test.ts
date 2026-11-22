import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { DOMAIN_GRAMMAR } from "../../src/astack/domain/notation.ts";
import { checkPlan } from "../../src/astack/plan/check.ts";
import { parsePlan } from "../../src/astack/plan/parse.ts";
import { FIXTURES, fixture, fixtureEnv, REPO } from "./plan-helpers.ts";

const DOMAIN_REPO = join(FIXTURES, "domain/repo");
const PLAN = "domain/repo/docs/plans/desk/B01.md";
const VALID = fixture(PLAN);
const CLI = resolve(import.meta.dir, "../../src/astack/cli/bin.ts");

function domainFindings(text: string, root = DOMAIN_REPO) {
	return checkPlan(parsePlan("docs/plans/desk/B01.md", text), fixtureEnv(root))
		.filter((finding) => finding.group === "domain")
		.map((finding) => [finding.line, finding.message]);
}

function edited(original: string, replacement: string): string {
	expect(VALID.split(original).length).toBe(2);
	return VALID.replace(original, replacement);
}

const SECTION = VALID.slice(
	VALID.indexOf("## Domain and effects"),
	VALID.indexOf("## Sessions"),
);

describe("the domain rules of check-plan", () => {
	test("[control:plan-domain-no-card] the fixed fixture passes, and a repo with no card gives no block error", () => {
		expect(domainFindings(VALID)).toEqual([]);
		expect(domainFindings(VALID.replace(SECTION, ""), REPO)).toEqual([]);
	});

	test.each<[string, string, string, (string | number)[][]]>([
		[
			"a code plan with no block",
			SECTION,
			"",
			[
				[
					48,
					"the Files cell src/desk/grant.ts#mergeGrantIn is under a code root, so the plan needs one ## Domain and effects H2 with one domain fence; astack check-plan --template=domain prints its grammar",
				],
			],
		],
		[
			"a law with no check",
			"   check: prop desk-owner",
			"",
			[
				[
					46,
					"law L1 has no check; end it with check: tsc, prop <control-id> or tla <Model>.<Invariant>",
				],
			],
		],
		[
			"an unlinked step",
			"src/desk/grant.ts#mergeGrantIn",
			"src/desk/grant.ts",
			[[43, "step mergeGrantIn needs one Files cell <module>#mergeGrantIn"]],
		],
		[
			"an error named Error",
			"GrantProblem",
			"Error",
			[
				[
					43,
					"step mergeGrantIn names the error Error; name the failure that a caller handles",
				],
			],
		],
		[
			"a rung below the derived rung",
			"rung R4",
			"rung R3",
			[[49, "rung R3 is below the derived rung R4 by law L2"]],
		],
		[
			"a context that the card does not hold",
			"context Desk\n",
			"context Billing\n",
			[
				[
					39,
					"context Billing is no context of the card in CONTEXT.md; use Desk, Kernel",
				],
			],
		],
		[
			"a cap ref with no op",
			"Clock.now",
			"Clock.later",
			[
				[
					43,
					"step mergeGrantIn names Clock.later, which is no op of a card cap or a plan cap",
				],
			],
		],
		[
			"a plan cap that the card holds",
			"cap  Clock [clock] @ src/ports/clock.ts: now(read)",
			"cap  Git [spawn] @ src/ports/git.ts: push(write)",
			[
				[
					42,
					"cap Git is a card cap of CONTEXT.md; name it in the step rows only",
				],
				[
					43,
					"step mergeGrantIn names Clock.now, which is no op of a card cap or a plan cap",
				],
			],
		],
		[
			"a read-only cap with fs-write",
			"[clock]",
			"[clock, fs-write]",
			[[42, "cap Clock has only read ops, but its classes hold fs-write"]],
		],
		[
			"an inv that no law tags",
			"law  L1 G1",
			"law  L1 Clock",
			[[41, "inv G1 has no law"]],
		],
		[
			"a write cap that no law tags",
			"law  L2 Git",
			"law  L2 G1",
			[[44, "the write cap Git has no law"]],
		],
		[
			"a map with no eq",
			", eq map(ok(g)) = ok(map(g))",
			"",
			[[48, "map Desk => Kernel needs an eq path equation and a prop check"]],
		],
		[
			"a tla law whose invariant the registry does not hold",
			"Desk.OnePush",
			"Desk.TwoPush",
			[
				[
					47,
					"law L2 checks tla Desk.TwoPush, which formal/models.json does not hold",
				],
			],
		],
		[
			"a Files cell under a fail-closed glob with no model",
			"src/desk/model.ts",
			"src/guard/new.ts",
			[
				[
					65,
					"the Files cell src/guard/new.ts is under the fail-closed glob src/guard/** of formal/models.json, but no model glob and no unmodelled entry names it",
				],
			],
		],
		[
			"a flow whose types differ by name",
			"step pushGrant : MergeGrant",
			"step pushGrant : GrantInput",
			[
				[
					45,
					"flow grant joins mergeGrantIn and pushGrant, but mergeGrantIn gives MergeGrant and pushGrant takes GrantInput",
				],
			],
		],
		[
			"a second domain fence",
			"rung R4\n```\n",
			"rung R4\n```\n\n```domain\ncontext Desk\n```\n",
			[
				[
					52,
					"## Domain and effects holds one domain fence, and this is a second",
				],
			],
		],
	])(
		"[control:plan-domain-rules] %s gives an error at its line",
		(_name, original, replacement, expected) => {
			expect(domainFindings(edited(original, replacement))).toEqual(expected);
		},
	);

	test("--template=domain prints the grammar of notation.ts", () => {
		const run = spawnSync("bun", [CLI, "check-plan", "--template=domain"], {
			encoding: "utf8",
		});
		expect(run.stdout).toBe(DOMAIN_GRAMMAR);
	});
});
