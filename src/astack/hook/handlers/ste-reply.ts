import { stateDir } from "../../state.ts";
import { rewriteReason } from "../../ste/format.ts";
import { loadSettings, settingsRootFrom } from "../../ste/profile.ts";
import {
	decideReply,
	type ReplyDecision,
	replyExemption,
} from "../../ste/reply.ts";
import {
	answersRewrite,
	claimReply,
	clearPending,
	clearRewrite,
	readRewrite,
	recordPending,
	replyKey,
	saveRewrite,
	sessionDir,
} from "../../ste/state.ts";
import {
	ALLOW,
	type Context,
	continueWith,
	defineHandler,
	type EventOf,
	projectDirOf,
} from "../events.ts";

function decide(event: EventOf<"reply">, context: Context): ReplyDecision {
	const why = replyExemption(event);
	if (why !== undefined) return { kind: "allow", why };
	const settings = loadSettings(
		settingsRootFrom(context.cwd, projectDirOf(context)),
	);
	return decideReply(event, settings.glossary);
}

export const handler = defineHandler({
	id: "ste-reply",
	quality: "ste",
	on: ["reply"],
	run: (event, context) => {
		if (event.subagent || !event.interactive) return ALLOW;
		const root = stateDir(context.env);
		const dir = root ? sessionDir(root, event.session) : undefined;
		if (!dir) return ALLOW;
		const key = replyKey(event.text, event.chain);
		const rewrite = readRewrite(dir);
		const decision = decide(event, context);
		if (answersRewrite(rewrite, key, event.fresh)) {
			saveRewrite(dir, { asked: rewrite.asked, answer: key });
			if (decision.kind === "rewrite")
				recordPending(dir, decision.findings.length);
			else clearPending(dir);
			return ALLOW;
		}
		if (decision.kind === "allow") {
			if (event.fresh) clearRewrite(dir);
			return ALLOW;
		}
		switch (claimReply(dir, key)) {
			case "claimed":
				return saveRewrite(dir, { asked: key })
					? continueWith(rewriteReason(decision.findings))
					: ALLOW;
			case "taken":
				recordPending(dir, decision.findings.length);
				return ALLOW;
			case "unavailable":
				return ALLOW;
		}
	},
});
