import type { Invite } from "./invite.ts";

// @ts-expect-error an accepted invite needs a member id
export const bad: Invite = { kind: "accepted" };
