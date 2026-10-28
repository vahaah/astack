import { sessionStartContext } from "../../plan/brief.ts";
import { ALLOW, defineHandler, note } from "../events.ts";

export const handler = defineHandler({
	id: "plan-pointer",
	on: ["session-start"],
	run: (event, context) => {
		const text = sessionStartContext(
			event.cwd,
			context.projectDir,
			context.today,
			event.attended,
		);
		return text === undefined ? ALLOW : note(text);
	},
});
