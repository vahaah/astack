import { resolve } from "node:path";
import { err, ok, type Result } from "../../src/astack/result.ts";

export const BUNDLE_PATH = "marketplace/plugins/astack/bin/astack.js";

export async function compileBundle(
	root: string,
): Promise<Result<Uint8Array, readonly string[]>> {
	const result = await Bun.build({
		entrypoints: [resolve(root, "src/astack/cli/bin.ts")],
		target: "node",
		minify: { whitespace: true },
		env: "disable",
		throw: false,
	});
	if (!result.success) {
		const problems = result.logs.map((entry) => entry.message);
		return err(problems.length === 0 ? ["The CLI build failed."] : problems);
	}
	const output = result.outputs[0];
	if (result.outputs.length !== 1 || output === undefined)
		return err(["The CLI build must produce exactly one file."]);
	return ok(new Uint8Array(await output.arrayBuffer()));
}
