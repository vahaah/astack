import { type Parser, z } from "zod";
import * as schema from "./schema.ts";

export { schema as tables };

export const ROLES = ["admin", "member"] as const;
export type Role = (typeof ROLES)[number];
export const RoleSchema = z.enum(ROLES);
export const limits = { free: 3, team: 50 } satisfies Record<string, number>;
export const opaque = (value: string) => value as unknown;
export type Brand = string & {};
export type Getters<T> = { [K in keyof T as `get${string & K}`]: () => T[K] };

export class NotFound extends Error {}

export function same(a: number, b: number): boolean {
	return a !== b ? !Number.isNaN(a) : true;
}

export const parser: Parser = schema.parser;
