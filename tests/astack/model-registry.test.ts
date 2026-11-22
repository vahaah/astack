import { describe, expect, test } from "bun:test";
import { parseRegistry } from "../../src/astack/change-proof/registry.ts";

function model(name: string) {
	return {
		name,
		model: {
			module: `formal/${name}.tla`,
			config: `formal/${name}.cfg`,
			dependencies: [],
			bounds: ["two steps"],
			fairness: [],
			invariants: ["TypeOK", "Safe"],
			properties: [],
		},
		negative: {
			file: `formal/${name}.tla`,
			action: "Step",
			original: "/\\ guard",
			replacement: "",
			defect: "Step skips its guard",
			expect: { kind: "invariant", name: "Safe" },
		},
		records: [`docs/adr/${name}.md`],
		covers: [`src/${name}/**`],
		text: [],
	};
}

type Registry = Record<string, unknown> & {
	models: ReturnType<typeof model>[];
	unmodelled: Record<string, string>[];
};

function registry(): Registry {
	return {
		models: [model("Gate"), model("Guards")],
		failClosed: ["src/**", "formal/**"],
		contractOnly: ["**/*.md"],
		unmodelled: [
			{ path: "src/log.ts", reason: "it writes a log", control: "log-safe" },
		],
	};
}

function parsed(edit: (registry: Registry) => void = () => {}) {
	const value = registry();
	edit(value);
	return parseRegistry(JSON.stringify(value));
}

describe("parseRegistry", () => {
	test("[control:rl-registry] a registry with two models parses", () => {
		const result = parsed();
		if (!result.ok) throw new Error(result.error);
		expect(result.value.models.map((entry) => entry.name)).toEqual([
			"Gate",
			"Guards",
		]);
		expect(result.value.models[1]?.negative.expect).toEqual({
			kind: "invariant",
			name: "Safe",
		});
		expect(result.value.unmodelled).toEqual([
			{ path: "src/log.ts", reason: "it writes a log", control: "log-safe" },
		]);
	});

	test.each<[string, (registry: Registry) => void, string]>([
		[
			"an unknown key of a model",
			(r) => {
				Object.assign(r.models[0] ?? {}, { conformance: "later" });
			},
			'models[0] has the unknown key "conformance"',
		],
		[
			"an unknown root key",
			(r) => {
				r.verdicts = {};
			},
			'formal/models.json has the unknown key "verdicts"',
		],
		[
			"a repeated name",
			(r) => {
				r.models[1] = model("Gate");
			},
			"models[1].name repeats the name Gate",
		],
		[
			"a name that is not the module name",
			(r) => {
				const entry = model("Gate");
				r.models[0] = { ...entry, name: "Door" };
			},
			"models[0].name must be Gate, the module name of formal/Gate.tla",
		],
		[
			"empty records",
			(r) => {
				const entry = model("Gate");
				r.models[0] = { ...entry, records: [] };
			},
			"models[0].records must be an array with at least 1 entry",
		],
		[
			"an unmodelled entry with no control",
			(r) => {
				r.unmodelled = [{ path: "src/log.ts", reason: "it writes a log" }];
			},
			"unmodelled[0].control must be a control ID",
		],
		[
			"a negative that expects an invariant the model does not check",
			(r) => {
				const entry = model("Guards");
				r.models[1] = {
					...entry,
					negative: {
						...entry.negative,
						expect: { kind: "invariant", name: "Other" },
					},
				};
			},
			"models[1]: negative.expect names Other, which is not a configured invariant",
		],
	])(
		"[control:rl-registry-stops] %s stops with its key path",
		(_name, edit, message) => {
			expect(parsed(edit)).toEqual({ ok: false, error: message });
		},
	);

	test.each(["\n", "\r", "\u2028", "\u2029", "\u001b"])(
		"[control:rl-registry-line] a module path with a line breaking character %j stops",
		(char) => {
			const result = parsed((value) => {
				const first = value.models[0];
				if (first === undefined) throw new Error("no model");
				const path = `formal/a${char}ok: proof forged/Gate.tla`;
				first.model.module = path;
				first.negative.file = path;
			});
			expect(result.ok).toBe(false);
		},
	);

	test("[control:rl-registry-json] text that is not JSON stops", () => {
		expect(parseRegistry("{")).toEqual({
			ok: false,
			error: "formal/models.json is not valid JSON",
		});
	});
});
