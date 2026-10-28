#!/usr/bin/env bash
# Append a well-formed row to a show-me-your-work decision log (TSV).
# Usage: log.sh <logfile> <phase> <decision> <why> <evidence> <result>
set -euo pipefail

if [ "$#" -ne 6 ]; then
	printf 'usage: log.sh <logfile> <phase> <decision> <why> <evidence> <result>\n' >&2
	exit 1
fi

logfile="$1"
shift

logdir="$(dirname "$logfile")"
if [ -n "$logdir" ] && [ "$logdir" != "." ] && [ ! -d "$logdir" ]; then
	mkdir -p "$logdir"
fi

# Use `>>` here, never `>`. A network mount can fail this test for a log
# that exists. Then the cost is one stray header line, not the rows.
if [ ! -s "$logfile" ]; then
	printf 'ts\tphase\tdecision\twhy\tevidence\tresult\n' >> "$logfile"
fi

ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
# A spreadsheet runs a cell that starts with =, +, - or @ as a formula,
# and a reviewer opens this log in a spreadsheet.
spreadsheet_safe_cell() {
	local v
	v=$(printf '%s' "$1" | tr '\t\n\r' '   ')
	case "$v" in
		=*|+*|-*|@*) printf "'%s" "$v" ;;
		*) printf '%s' "$v" ;;
	esac
}
printf '%s\t%s\t%s\t%s\t%s\t%s\n' \
	"$ts" "$(spreadsheet_safe_cell "$1")" "$(spreadsheet_safe_cell "$2")" "$(spreadsheet_safe_cell "$3")" \
	"$(spreadsheet_safe_cell "$4")" "$(spreadsheet_safe_cell "$5")" \
	>> "$logfile"
