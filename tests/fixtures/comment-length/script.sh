#!/usr/bin/env bash
# The web server reopens its log file on SIGUSR1,
# so the rename happens before the signal.
set -euo pipefail
