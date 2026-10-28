import { COMPANION_ENV } from "../scripts/lib/companion.ts";

export function envWithoutCompanion(): Record<string, string | undefined> {
	const { [COMPANION_ENV]: _named, ...env } = process.env;
	return env;
}
