const label = "value as any and rows[0]! and @ts-ignore";
const note = `cast ${label} as text`;
const pattern = /x as any!/g;
// value as any, rows[0]!, @ts-nocheck in prose
/* item as unknown as Item */
export function Banner() {
	return (
		<p title="x as any">
			Do not write value as any or rows[0]! in the code.
		</p>
	);
}
export const ok = label !== note && !pattern.test(label);
