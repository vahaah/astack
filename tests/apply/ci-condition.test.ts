import { describe, expect, test } from "bun:test";
import {
	canRun,
	pullRequestScenarios,
} from "../../scripts/lib/ci-condition.ts";

const opened = pullRequestScenarios({ pull_request: null }, ["pull_request"]);
const labelled = pullRequestScenarios(
	{
		pull_request: {
			types: ["labeled", "unlabeled", "synchronize", "reopened", "closed"],
		},
	},
	["pull_request"],
);

const previewOnly = [
	"github.event.action != 'closed' &&",
	"(github.event_name == 'workflow_dispatch' ||",
	"(github.event.action == 'labeled' && github.event.label.name == 'preview') ||",
	"(github.event.action != 'labeled' && github.event.action != 'unlabeled' &&",
	"contains(github.event.pull_request.labels.*.name, 'preview')))",
].join(" ");

describe("pullRequestScenarios", () => {
	test("a pull request trigger without types gives the three default actions", () => {
		expect(opened).toEqual([
			{ event: "pull_request", action: "opened" },
			{ event: "pull_request", action: "synchronize" },
			{ event: "pull_request", action: "reopened" },
		]);
	});

	test("label and close actions do not count, because they change no open pull request without a label", () => {
		expect(labelled).toEqual([
			{ event: "pull_request", action: "synchronize" },
			{ event: "pull_request", action: "reopened" },
		]);
	});
});

describe("canRun", () => {
	test.each<[string, unknown, boolean]>([
		["no condition", undefined, true],
		["another event", "github.event_name != 'pull_request'", false],
		["a schedule only", `\${{ github.event_name == 'schedule' }}`, false],
		[
			"a pull request or a dispatch",
			"github.event_name == 'pull_request' || github.event_name == 'workflow_dispatch'",
			true,
		],
		[
			"event names compare without case",
			"github.event_name == 'Pull_Request'",
			true,
		],
		[
			"an unset dispatch input",
			`\${{ !cancelled() && inputs.refresh }}`,
			false,
		],
		[
			"a negated dispatch input",
			`\${{ !cancelled() && !inputs.refresh }}`,
			true,
		],
		["a red job only", `\${{ failure() }}`, false],
		["always", "always()", true],
		[
			"a job output that the check cannot read",
			"needs.plan.outputs.run == 'true'",
			true,
		],
		[
			"an unknown value and a false one",
			"needs.plan.outputs.run == 'true' && github.event_name == 'push'",
			false,
		],
		[
			"two interpolations",
			`\${{ github.event_name == 'push' }} && \${{ false }}`,
			true,
		],
		["text that does not parse", "github.event_name == ", true],
	])("%s: %p gives %p", (_name, condition, expected) => {
		expect(canRun(condition, opened)).toBe(expected);
	});

	test("a job that needs the preview label never runs on a pull request without it", () => {
		expect(canRun(previewOnly, labelled)).toBe(false);
		expect(
			canRun(
				"github.event.action == 'closed' || (github.event.action == 'unlabeled' && github.event.label.name == 'preview')",
				labelled,
			),
		).toBe(false);
	});

	test("an assumed job output decides a condition that reads it", () => {
		const condition = "needs.changes.outputs.code == 'true'";
		expect(
			canRun(condition, opened, { "needs.changes.outputs.code": "false" }),
		).toBe(false);
		expect(
			canRun(condition, opened, { "needs.changes.outputs.code": "true" }),
		).toBe(true);
	});
});
