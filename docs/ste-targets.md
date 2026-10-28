# STE reply rewrite on each target

These notes are for the dist builder. Design sections 9.4 and 10 set the target. This file maps the Claude Code handler to Cursor, Codex and the targets with no hooks.

## The shared core

- `decideReply` in `src/astack/ste/reply.ts` is pure. It takes the reply text and the `interactive` and `subagent` flags. It returns `allow` with a reason, or `rewrite` with the findings. A short reply and an interim reply get the same check. A reply in another script or in another language with Latin letters gets one `language` finding.
- `rewriteReason` in `src/astack/ste/format.ts` writes the instruction. It lists 8 findings or fewer and ends with `REWRITE_TAIL`, which says "Do not call tools."
- `claimReply` in `src/astack/ste/state.ts` opens `<state>/ste/<session>/<hash>.claim` with the `wx` flag. The hash comes from the chain id of the reply event and the reply text. Without a chain id, it comes from the text only. Only one process gets the claim.
- `rewrite.json` in the same folder holds the `asked` hash of the blocked reply and the `answer` hash of its rewrite. `answersRewrite` decides from it and from the `fresh` flag of the reply event. So each reply gets one rewrite at most (design 9.4).
- The `turn` handler deletes the claims and `rewrite.json` on each prompt.
- Every target uses this core. Only the decoder and the encoder change.

## Cursor, as a local plugin

The Cursor `stop` input has `status` and `loop_count`, but no reply text. So the build needs two hooks.

1. `afterAgentResponse` gets the reply `text` with `conversation_id` and `generation_id`. Save the text under `<state>/ste/<conversation_id>/last.reply`. Print nothing, because this hook is passive.
2. `beforeSubmitPrompt` is the human prompt. Map it to the `prompt` event with `human: true`, so the claims go.
3. `stop` with `status` set to `completed` reads the saved reply. A `loop_count` of 0 sets `fresh`. Run `decideReply`, then `claimReply` with the conversation as the session. When the `stop` input has `generation_id`, it is the chain id.
4. On `rewrite`, print `{"followup_message": "<the rewrite reason>"}`. In all other cases, print `{}`.
5. Set `"loop_limit": 1` on the `stop` entry in `hooks.json`. Then Cursor sends one follow-up at most, also when the state dir fails.
6. Cursor shows the follow-up as a user message. The owner sees the first reply and the rewrite.

The permission hooks are `preToolUse`, `beforeShellExecution` and `beforeMCPExecution`. Cursor blocks the action when such a hook prints JSON that it cannot parse. So these hooks always print valid JSON. Fail open prints `{"permission":"allow"}`. A deny prints `{"permission":"deny","agent_message":"<reason>"}`. The STE artifact handlers give the same verdicts as on Claude Code.

- A `stop` with a `status` other than `completed`, such as `aborted` or `error`, sends no follow-up. The queued edit problems wait for the next completed stop.
- A background agent gets `is_background_agent: true` only on `sessionStart`. So `sessionStart` returns `{"env": {"ASTACK_ATTENDED": "0"}}` for it, and Cursor passes that env to the later hooks. The `stop` decoder then sets `interactive: false`.
- The Cursor docs say that `agent_message` goes to the agent on a deny. So a note on an allowed permission event can get lost. astack keeps `agent_message` on the allow, and it also queues each note. The next `stop` follow-up that goes out carries the last 5 notes.

What the `cursor-agent` 2026.01.23 bundle shows:
- The CLI resets `loop_count` to 0 on each prompt that a person submits. A `followup_message` goes in the queue as a user message, and it does not run `beforeSubmitPrompt`. So `loop_limit: 1` allows one follow-up for each human turn.
- The `sessionStart` output `env` goes to `setSessionEnvironment`, so the later hooks see it.
- The CLI runs no `afterAgentResponse` hook. So in `cursor-agent`, the `stop` hook has no reply text, and replies get no rewrite there. Edit problems still go out.

Not probed yet:
- Whether the Cursor IDE runs `afterAgentResponse` and resets `loop_count` in the same way as the CLI.
- Whether `preToolUse` for `Write` carries the full file text (design E1). If not, the docs check moves to `afterFileEdit` and a `stop` follow-up.

## Codex

- Codex reads the Claude marketplace and its `hooks/hooks.json`. The Codex Stop input has `last_assistant_message`, `stop_hook_active` and `turn_id`.
- Codex runs the same command as Claude Code, `astack hook claude-code Stop`. So the Claude Code encoder prints a rewrite as `{"decision":"block","reason":"<the rewrite reason>"}` on stdout with exit 0. Claude Code and Codex both read that form.
- `stop_hook_active: false` sets `fresh`, as on Claude Code. `turn_id` is the chain id. So a reply that repeats in a new turn and fails gets its own claim.
- The signal for `codex exec` is not probed yet (design E3). Codex sets no `CLAUDE_CODE_ENTRYPOINT`, so a `codex exec` run counts as attended and its replies can get a rewrite. A probe needs a Codex login in a temporary `CODEX_HOME`.

## Grok Bot and the agentskills bundle

These targets have no hook. The STE lines of the rule card and the `astack check-ste -` step in skill text are the only carriers.

## What the Claude Code run proved

The probes ran on Claude Code 2.1.301 on 2026-10-16.

- In `claude -p`, a Stop hook sees `CLAUDE_CODE_ENTRYPOINT=sdk-cli` and `CLAUDE_CODE_SESSION_ATTENDED=0`. This is also true when the parent shell exports `cli` and `1`.
- On the main thread, the Stop payload has `prompt_id` and no `agent_id`. A subagent fires SubagentStop with `agent_id`. astack never registers SubagentStop, and the decoder also treats an `agent_id` on Stop as a subagent.
- The UserPromptSubmit schema of 2.1.301 has a `source` field with the values `user`, `sdk`, `system`, `loop_wakeup`, `schedule_wakeup` and `poll_event`. The payload does not carry it yet. The decoder uses it when it is present.
- With `ASTACK_STE_TEST_INTERACTIVE=1`, a `claude -p` run with the astack plugin gave one block with exit 2, one rewrite, and a stop after 2 turns.
- Exit 2 and a `decision: block` JSON both continue the turn. Both show "Stop hook error occurred" in the UI.
- With one rewrite for each reply, a `claude -p` run with the short reply "It's done." got one block. Its rewrite "It is done." passed. A reply in Russian got one `language` block, and its English rewrite passed. Each run had 2 Stop hooks, and `rewrite.json` held `asked` and `answer`.
- The Stop after a block keeps the `prompt_id` of the first Stop. A `claude -p` run proved this on 2026-10-16 with `It's done; ok.`, with a German reply and with a reply in one `md` fence. Each run got one block, and each rewrite passed.
