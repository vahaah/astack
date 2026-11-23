import { unattendedReason } from "../../attended.ts";
import { sessionStartContext } from "../../plan/brief.ts";
import { ALLOW, defineHandler, note } from "../events.ts";

export const handler = defineHandler({
	id: "plan-pointer",
	on: ["session-start"],
	run: (event, context) => {
		const text = sessionStartContext(
			context.ports,
			event.cwd,
			context.projectDir,
			context.today,
			event.attended
				? undefined
				: (unattendedReason(context.env) ?? "the host runs a background agent"),
		);
		return text === undefined ? ALLOW : note(text);
	},
});
