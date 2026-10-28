/**
 * Picks the newest row for each key.
 * Rows arrive sorted by key, then by version.
 * A later row with the same key replaces the earlier one.
 * Rows without a key are dropped.
 */
function newestPerKey(rows: Row[]): Row[] {}
