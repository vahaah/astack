import { existsSync, readFileSync } from "node:fs";

const readme = readFileSync("README.md", "utf8");
const images = [
	...readme.matchAll(/!\[[^\]]+\]\((docs\/charts\/[^)]+\.svg)\)/g),
].flatMap((match) => (match[1] === undefined ? [] : [match[1]]));
const problems: string[] = [];

if (images.length === 0) problems.push("README has no workflow chart images");

for (const image of images) {
	const source = image.replace(/\.svg$/, ".mmd");
	if (!readme.includes(`](${source})`))
		problems.push(`README has no source link for ${image}`);
	if (!existsSync(image) || !existsSync(source)) {
		problems.push(`${image} needs both its image and Mermaid source`);
		continue;
	}
	const svg = readFileSync(image, "utf8");
	if (!svg.startsWith("<svg")) problems.push(`${image} is not an SVG document`);
	if (/<foreignObject\b/i.test(svg))
		problems.push(`${image} uses HTML labels that image viewers can remove`);
	if (!/background-color:\s*white/.test(svg))
		problems.push(`${image} has no white background`);
	const text = svg
		.replace(/<style[\s\S]*?<\/style>/g, "")
		.replace(/<[^>]+>/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/\s+/g, " ");
	const labels = [
		...readFileSync(source, "utf8").matchAll(
			/\[\s*"?([^"\]]+)"?\s*\]|\{\s*"?([^"}]+)"?\s*\}|\|([^|]+)\|/g,
		),
	].map((match) => (match[1] ?? match[2] ?? match[3] ?? "").trim());
	if (labels.length === 0) problems.push(`${source} has no chart labels`);
	for (const label of labels) {
		if (!text.includes(label))
			problems.push(`${image} lacks the label "${label}"`);
	}
}

if (problems.length > 0) {
	console.error(problems.join("\n"));
	console.error(`FAIL ${problems.length} chart problem(s)`);
	process.exit(1);
}
console.log(`PASS ${images.length} chart images match their Mermaid labels`);
