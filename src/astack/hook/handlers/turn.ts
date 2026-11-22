import { unattendedReason } from "../../attended.ts";
import { stateDir } from "../../state.ts";
import { pendingNote } from "../../ste/format.ts";
import { replyInteractive } from "../../ste/session.ts";
import {
	advanceTurn,
	currentTurn,
	pruneSessions,
	saveCrons,
	sessionDir,
	takePending,
} from "../../ste/state.ts";
import { ALLOW, defineHandler, note } from "../events.ts";

export const handler = defineHandler({
	id: "turn",
	on: ["prompt", "reply"],
	run: (event, context) => {
		const unattended = unattendedReason(context.env);
		if (event.kind === "prompt" && event.human && unattended !== undefined)
			return note(
				`astack: a person typed this prompt, so this turn is attended. ${unattended} makes the other turns of the session unattended. At S0 of /astack:plan, treat this turn as attended, also when astack plan attended prints unattended.`,
			);
		const root = stateDir(context.env);
		if (!root) return ALLOW;
		const dir = sessionDir(root, event.session);
		if (!dir) return ALLOW;
		switch (event.kind) {
			case "reply":
				if (!event.subagent) saveCrons(dir, event.crons);
				return ALLOW;
			case "prompt": {
				if (!replyInteractive(context.env)) return ALLOW;
				if (currentTurn(dir) === 0) pruneSessions(root, Date.now());
				const pending = takePending(dir);
				advanceTurn(dir);
				return pending && context.hooks?.ste !== false
					? note(pendingNote(pending))
					: ALLOW;
			}
		}
	},
});
