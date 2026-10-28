---
name: "astack-control-cli"
description: "Drive, inspect, and profile interactive CLIs or TUIs. Use for terminal bugs, prompt flows, startup, hangs, memory growth, or demos."
license: "MIT"
metadata:
  astack-version: "0.1.0"
  source: "astack, adapted from cursor-team-kit"
---

# Control CLI

`<skill-dir>` in a command below is the folder that holds this SKILL.md.

Drive an interactive CLI or TUI through a repeatable session.
Use the repo's test or demo scripts first.
Create a temporary driver only when the repo has none.

## When to use it

- Reproduce a CLI or TUI bug with fixed input.
- Check prompts, keys, interrupts, resize behavior, and terminal layout.
- Capture transcripts before and after a fix.
- Measure startup, a slow action, a hang, or memory growth.
- Record a terminal demo when output explains the result best.

## Drive the session

1. Name the command and the smallest workspace that reproduces the behavior.
2. Find an existing package script, end-to-end test, demo recorder, expect script, or PTY helper.
3. If none exists, start an isolated session with fixed environment variables.
4. Capture the screen before the first action.
5. Send one action, such as text, Enter, an arrow, Escape, Ctrl-C, or a resize.
6. Wait for a specific screen pattern before the next action.
7. Save the transcript and profile output.
8. Stop the session and remove the temporary files you created.

## Choose the session type

Run `command -v tmux`.
If it succeeds, use tmux.
Otherwise use the bundled PTY driver, which needs `python3`.

For a session that must outlive one tool call, start Bash with `run_in_background: true`.
The start command reports its exit through a notification.
Use Monitor for output while the session runs.
Match every outcome that needs action, including failures:

```bash
tail -n 0 -F "$DIR/output.log" | grep --line-buffered -E 'ready|Error|panic|Traceback|Killed'
```

The start command already reports the exit, so the filter need not match it.
For one condition, prefer a Bash command that exits when the condition holds.
Run a long wait in the background.
Use Monitor for an event stream.

Keep session files in a temporary directory from `mktemp -d` or in the session scratchpad.
Keep a reusable test in the repo only when the user requests one.

### Use tmux

```bash
SESSION="cli-$(date +%s)"
tmux new-session -d -s "$SESSION" -x 120 -y 40 -- <command-under-test>
tmux pipe-pane -t "$SESSION" -o "cat >> $DIR/output.log"
tmux capture-pane -pt "$SESSION"
tmux send-keys -t "$SESSION" "help" Enter
until tmux capture-pane -pt "$SESSION" | grep -q '<expected text>'; do sleep 0.2; done
tmux capture-pane -pt "$SESSION" -S -200
tmux resize-window -t "$SESSION" -x 80 -y 24
tmux send-keys -t "$SESSION" C-c
tmux kill-session -t "$SESSION"
```

`capture-pane` prints the rendered screen.
`pipe-pane` saves the raw transcript.

### Use the PTY driver

`scripts/pty_session.py` starts a command in a pseudo-terminal.
It appends output to `<dir>/output.log`.
A control pipe in that directory accepts input.

Start it with `run_in_background: true`.
It prints `exit <code>` when the command ends:

```bash
python3 "<skill-dir>/scripts/pty_session.py" start --dir "$DIR" --rows 40 --cols 120 -- <command> <args>
```

Drive it through separate Bash calls:

```bash
PTY="python3 <skill-dir>/scripts/pty_session.py"
$PTY wait --dir "$DIR" --pattern 'ready>' --timeout 30
OFFSET=$($PTY send --dir "$DIR" --text 'help' --keys Enter | awk '{print $2}')
$PTY wait --dir "$DIR" --after "$OFFSET" --pattern 'Usage:'
$PTY send --dir "$DIR" --keys Up Enter
$PTY send --dir "$DIR" --resize 24 80
$PTY send --dir "$DIR" --keys C-c
$PTY screen --dir "$DIR" --lines 40
$PTY stop --dir "$DIR"
```

- `send` prints the transcript offset when it sends input.
  Pass that offset to `wait --after` to match output from after the action.
- `wait` exits 0 for a match, 1 for a timeout, and 3 if the session ends first.
  For codes 1 and 3, it prints the last lines it saw.
- `--keys` accepts `Enter`, `Tab`, `Escape`, `Backspace`, `Space`, the arrows, `Home`, `End`, `PageUp`, `PageDown`, and `Delete`.
  It also accepts `C-a`, `C-c`, `C-d`, `C-e`, `C-k`, `C-l`, `C-r`, `C-u`, `C-w`, and `C-z`.
  `C-c` passes through the terminal and delivers SIGINT to the foreground process as a user's key does.
- `--signal TERM` signals the process group directly.
  `stop` sends TERM, then KILL after five seconds.
- `screen` removes escape codes and carriage-return overwrites.
  If `pyte` is installed, it renders the terminal screen.
- `start --timeout <seconds>` kills the session at its deadline.

If the driver lacks a terminal control, write a short `pty.fork()` script in the same temporary directory.

## Collect a profile

- For startup, time the baseline and change on the same machine with the same environment and command.
- For a slow action, start a CPU profile before the action.
  Stop it afterward and compare functions by self time.
- For memory growth, force GC when the runtime permits it.
  Take a heap snapshot, repeat the action, force GC again, and take another snapshot.
- For a hang, capture the screen, active handles, and a stack or CPU sample before you interrupt it.
- For Node, start with `NODE_OPTIONS="--inspect=127.0.0.1:0"`.
  For Bun, use `bun --inspect=127.0.0.1:0 <entry>`.
  Read the inspector URL from the transcript and connect a DevTools-compatible client.

## Keep the session safe

Wait for a pattern instead of a fixed delay.
If a delay is necessary, explain why.
Never type credentials or destructive commands into the session.
Use the current repo's scripts and runtime.
Do not copy paths or commands from another repo.

Stop every session you started.
Remove temporary directories, inspector processes, and demo files unless the user wants to keep them.
