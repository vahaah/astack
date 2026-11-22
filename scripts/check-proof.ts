import { readFileSync } from "node:fs";
import { main } from "../src/astack/cli/main.ts";
import { err, ok, type Result } from "../src/astack/result.ts";

type Env = Readonly<Record<string, string | undefined>>;

const NO_DEFAULT_BRANCH =
	"A push proof needs repository.default_branch in the GITHUB_EVENT_PATH payload.";

function defaultBranch(path: string | undefined): Result<string, string> {
	if (path === undefined || path === "") return err(NO_DEFAULT_BRANCH);
	let payload: unknown;
	try {
		payload = JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return err(NO_DEFAULT_BRANCH);
	}
	if (
		typeof payload !== "object" ||
		payload === null ||
		!("repository" in payload)
	)
		return err(NO_DEFAULT_BRANCH);
	const { repository } = payload;
	if (
		typeof repository !== "object" ||
		repository === null ||
		!("default_branch" in repository)
	)
		return err(NO_DEFAULT_BRANCH);
	const branch = repository.default_branch;
	return typeof branch === "string" && branch !== ""
		? ok(branch)
		: err(NO_DEFAULT_BRANCH);
}

function baseRef(env: Env): Result<string | undefined, string> {
	switch (env.GITHUB_EVENT_NAME) {
		case "pull_request": {
			const base = env.GITHUB_BASE_REF;
			return base === undefined || base === ""
				? err("A pull-request proof needs GITHUB_BASE_REF.")
				: ok(`origin/${base}`);
		}
		case "push": {
			const ref = env.GITHUB_REF ?? "";
			if (ref.startsWith("refs/tags/")) return ok("HEAD^");
			const branch = defaultBranch(env.GITHUB_EVENT_PATH);
			if (!branch.ok) return branch;
			return ok(
				ref === `refs/heads/${branch.value}`
					? "HEAD^"
					: `origin/${branch.value}`,
			);
		}
		default:
			return ok(undefined);
	}
}

const base = baseRef(process.env);
if (!base.ok) {
	process.stderr.write(`${base.error}\n`);
	process.exit(1);
}
process.exitCode = await main(
	base.value === undefined
		? ["check", "proof"]
		: ["check", "proof", "--base", base.value],
);
