import { readFileSync } from "node:fs";

const charts = ["docs/charts/daily-path.mmd", "docs/charts/session-waves.mmd"];
const readme = readFileSync("README.md", "utf8");
const blocks = [...readme.matchAll(/```mermaid\n([\s\S]*?)```/g)].map(
	(m) => m[1],
);
const problems: string[] = [];
if (blocks.length !== charts.length)
	problems.push(
		`README.md has ${blocks.length} mermaid blocks, expected ${charts.length}`,
	);
charts.forEach((chart, i) => {
	if (readFileSync(chart, "utf8") !== blocks[i])
		problems.push(`${chart} differs from mermaid block ${i + 1} in README.md`);
});
if (problems.length > 0) {
	for (const problem of problems) console.error(problem);
	process.exit(1);
}
console.log(`readme-charts: ${charts.length} charts match README.md`);
