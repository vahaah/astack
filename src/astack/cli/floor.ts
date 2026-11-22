export const NODE_FLOOR = 22;

export type FloorStop = { readonly code: 0 | 1; readonly message: string };

export function floorStop(
	versions: { readonly node: string; readonly bun?: string },
	args: readonly string[],
): FloorStop | undefined {
	if (versions.bun !== undefined) return undefined;
	if (Number(versions.node.split(".")[0]) >= NODE_FLOOR) return undefined;
	return {
		code: args[0] === "hook" ? 0 : 1,
		message: `astack: node ${versions.node} is older than node ${NODE_FLOOR}, so the astack checks did not run. Set ASTACK_RUNTIME to the path of node ${NODE_FLOOR} or later or bun.\n`,
	};
}
