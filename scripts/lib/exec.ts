export type ExecResult = {
	exitCode: number | null;
	stdout: string;
	stderr: string;
	timedOut: boolean;
};

const gitLocationVars = [
	"GIT_DIR",
	"GIT_WORK_TREE",
	"GIT_INDEX_FILE",
	"GIT_COMMON_DIR",
	"GIT_OBJECT_DIRECTORY",
];

export function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function cleanEnv(
	extra: Record<string, string> = {},
): Record<string, string> {
	const env: Record<string, string> = {};
	for (const [key, value] of Object.entries(process.env)) {
		if (value !== undefined && !gitLocationVars.includes(key)) env[key] = value;
	}
	return { ...env, ...extra };
}

type RunOptions = {
	cwd: string;
	timeoutSeconds?: number;
	env?: Record<string, string>;
};

function spawn(argv: readonly string[], options: RunOptions) {
	try {
		return Bun.spawn([...argv], {
			cwd: options.cwd,
			env: options.env ?? cleanEnv(),
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
		});
	} catch (error) {
		return `could not start ${argv[0]}: ${messageOf(error)}`;
	}
}

export async function run(
	argv: readonly string[],
	options: RunOptions,
): Promise<ExecResult> {
	const child = spawn(argv, options);
	if (typeof child === "string") {
		return { exitCode: null, stdout: "", stderr: child, timedOut: false };
	}
	let timedOut = false;
	const timer = setTimeout(
		() => {
			timedOut = true;
			child.kill("SIGKILL");
		},
		(options.timeoutSeconds ?? 600) * 1000,
	);
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	clearTimeout(timer);
	return { exitCode: timedOut ? null : exitCode, stdout, stderr, timedOut };
}

export async function git(
	cwd: string,
	args: readonly string[],
): Promise<ExecResult> {
	return run(["git", "-C", cwd, ...args], { cwd, timeoutSeconds: 120 });
}

export async function gitText(
	cwd: string,
	args: readonly string[],
): Promise<string> {
	const result = await git(cwd, args);
	if (result.exitCode !== 0) {
		throw new Error(
			`git ${args.join(" ")} failed in ${cwd}: ${result.stderr.trim()}`,
		);
	}
	return result.stdout.trim();
}
