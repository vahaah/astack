import type { Command } from "../../command.ts";
import { command as ciPins } from "./ci-pins.ts";
import { command as comments } from "./comments.ts";
import { command as migrations } from "./migrations.ts";
import { command as plan } from "./plan.ts";
import { command as pr } from "./pr.ts";
import { command as stackConfig } from "./stack-config.ts";
import { command as ste } from "./ste.ts";
import { command as ticket } from "./ticket.ts";
import { command as types } from "./types.ts";

export const CHECKS: readonly Command[] = [
	comments,
	types,
	ticket,
	pr,
	plan,
	ste,
	migrations,
	stackConfig,
	ciPins,
];
