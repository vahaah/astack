import type { Command } from "../command.ts";
import { command as board } from "./board.ts";
import { CHECKS } from "./check/index.ts";
import { command as check, checkAlias } from "./check.ts";
import { command as doctor } from "./doctor.ts";
import { command as hook } from "./hook.ts";
import { command as init } from "./init.ts";
import { command as managed } from "./managed.ts";
import { command as orch } from "./orch.ts";
import { command as plan } from "./plan.ts";
import { command as planTicket } from "./plan-ticket.ts";
import { command as print } from "./print.ts";
import { command as session } from "./session.ts";
import { command as skillPath } from "./skill-path.ts";
import { command as stack } from "./stack.ts";
import { command as watchPr } from "./watch-pr.ts";

export const COMMANDS: readonly Command<number | Promise<number>>[] = [
	hook,
	check,
	plan,
	planTicket,
	session,
	stack,
	board,
	skillPath,
	managed,
	doctor,
	print,
	init,
	orch,
	watchPr,
];

export const ALIASES: readonly Command[] = CHECKS.map(checkAlias);
