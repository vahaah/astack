/**
 * Parses a duration such as `90s`, `15m` or `2h` into milliseconds.
 *
 * Accepts one integer followed by one unit. Whitespace around the
 * value is ignored. Units are case-sensitive.
 *
 * @param input the duration text
 * @returns the duration in milliseconds
 * @throws RangeError when the unit is unknown or the number overflows
 * @example parseDuration("15m") === 900_000
 */
export function parseDuration(input: string): number {}
