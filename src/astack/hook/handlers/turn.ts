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
