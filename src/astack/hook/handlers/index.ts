import type { Handler } from "../events.ts";
import { handler as comments } from "./comments.ts";
import { handler as destructive } from "./destructive.ts";
import { handler as duplicatePr } from "./duplicate-pr.ts";
import { handler as mergeGuard } from "./merge-guard.ts";
import { handler as planFile } from "./plan-file.ts";
import { handler as planPointer } from "./plan-pointer.ts";
import { handler as prBody } from "./pr-body.ts";
import { handler as steArtifact } from "./ste-artifact.ts";
import { handler as steReply } from "./ste-reply.ts";
import { handler as ticket } from "./ticket.ts";
import { handler as turn } from "./turn.ts";
import { handler as types } from "./types.ts";

export const HANDLERS: readonly Handler[] = [
	comments,
	types,
	steArtifact,
	planFile,
	ticket,
	prBody,
	mergeGuard,
	duplicatePr,
	destructive,
	steReply,
	turn,
	planPointer,
];
