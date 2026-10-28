---
plan: form-order
tier: standard
status: active
home: repo
tracker: ABC-372
delegate: off
checkpoints: report
owner-gates: [production merge, hosted migration, money, legal, accounts, secrets, client messages, destructive resets]
execute: S1
reviewed: 2026-10-14
---

# Inspectors see form items in document order

Inspectors jump around the form because the item panel groups rows by state. After this plan the panel, the gates and the copies follow the form from top to bottom.

## Context

- Ticket ABC-372. The item panel does not follow document order, so an inspector jumps around the form. The acceptance criteria are three. The list runs top to bottom. Next and previous follow document order. A fill does not move its row.
- The decision that this work drives is "is this form ready to issue or to approve?" So the goal is that nobody misses an item. This holds for the author and for the reviewer.
- Root cause. `item-group-list.tsx:26-77` groups rows as unfilled, filled and optional. A fill therefore moves the row, and the state wins over the position.
- Root cause. Rows arrive in `sort_order` order from `listRevisionItems` in `queries/forms.ts:2952-2956`. `sort_order` is the creation order of the template, with no tiebreaker, and duplicate values happen.
- Root cause. Navigation in `utils.ts:55-78` compares opaque numbers with a strict less-than, so the user can never reach a tied item. A unique document index fixes it, and only the caller at `item-panel.tsx:149-174` changes.
- Root cause. Focus mode mounts only the active section in `form-page-content.tsx:3317-3322`. A target in another section gets nothing from `findItemElement`, so the button does nothing.
- Fact. Submit for review is a soft block. An acknowledgement overrides it and writes a `review_override` audit row. It counts the present required items only, and the order plays no part.
- Fact. Approve has no item check at all. In review the panel stays editable, and it is the only list that the reviewer has.
- Fact. The panel serves every form type, so the fix ships for all of them. Only `content_markdown` gets a scan, and an unfilled token exports blank with no marker.
- Fact. Five paths skip the submit check. They are the REST API, the MCP tools, a create in review, a move from draft to approved and a direct database write. ADR-0010 says that they must not.
- Count, read-only. The production data holds 99 forms, 121 revisions, 3,000 sections, 942 item rows, 27 templates and 4 teams.
- Count, read-only. 0 item tokens sit outside rich-text content. All 273 sections with tokens are rich text.
- Count, read-only. 0 widget sections hold tokens, and 0 values hold a quote, a backslash, a brace or a control character. So no repair is necessary.
- Count, read-only. 0 forms moved from draft straight to approved. 4 forms are approved and 5 are in review. Only 1 `review_override` row exists.
- Count, read-only. 1 approved revision has 7 required items empty and no override row. The approve gap has happened in production.
- Count, read-only. 2 forms in review have no reviewer, so nobody can approve them in the app.
- Main sync. A third fill writer `fillPartnerItems` arrived at `queries/forms.ts:6030`. It refuses only a blank value and a closing brace, and `reapply.ts:197` mirrors it.
- Main sync. A revision lock rule arrived at `queries/forms.ts:5781-5828`. Database tests run in a separate lane through `tooling/db-tests.sh`, and `bun run test` skips them.
- Main sync. The production workflow now needs each migration to be in place before the merge. No ADR changed, and the newest ADR is 0067.
- Main sync. A support agent who is also an admin skips single sign-on on the API only. The approve gate must not reuse that path.
- Main sync. The partner write-back fires after `updateFormRevisionMetadata` returns, on the API, on REST and on MCP. So a gate that must stop the write-back throws before the return.
- Measure. Each query to measure production data is a count with no row content. The owner sees each query before it runs. The queries live in the drafts folder of the plan, never in the repo.
- Risk. The schema of the guard lands before the code. Between the two, the old app moves forms through a privileged handle, so the guard must allow that handle.
- Fact. The empty state of the panel says "No items in this form" today. The filter needs its own empty state, because a form with every item filled is not a form with no items.
- Fact. The template tab reads `staticContentMarkdown` for each section that is not generated. It sorts the items by `sort_order`, so a drag of a section does not change the tab.
- Fact. Focus mode keeps the active section in the URL as `section=`. A link with a section that no longer exists gives an empty editor today.
- Fact. The panel has no section switcher below the extra-large breakpoint. This plan does not add one, and the drafts file holds it.
- Fact. A `data_table` section never renders its markdown content. Its items are listed but never print, so the drafts file holds this defect too.
- Fact. The import dialog of templates groups items by state, in the same way as the old panel. This plan leaves the dialog as it is, and the drafts file holds it.
- Fact. The gates run only in the worktree, because untracked files at the root of the main checkout turn `bun lint` red. Each worker runs `bun install` first and checks that `node_modules` exists.
- Fact. The e2e runs with `E2E_USE_EXISTING_SERVERS=1`. A worker restarts the dev server before it trusts a run, because a stale server serves old code.
- Risk. The partner fills have run since the last count, and nobody measured them. Before the merge, step 6 runs the value count again. A count above 0 brings the repair step back.

## Goal

Goal. An inspector fills a form from top to bottom and misses no required item.
Decision. Is this form ready to issue or to approve?
Done when. `bun run e2e forms.scenario` passes on every form type, and today 3 of 9 of its checks fail on trunk.

## Scope

- In. The item panel, next and previous, and the submit and approve gates. Also the copy of a form, the template tab and the write paths that skip the submit check.
- Out. A server-side sort column, the identity of the approver on the server, the audit of status changes through REST, and the autosave version race. These go to the drafts file.

## Decisions

| # | Kind | Decision | Rejected | Door | Settled | Record |
|---|---|---|---|---|---|---|
| D1 | goal | Nobody misses an item before a form is issued or approved, for the author and for the reviewer | A check of the acceptance criteria only, which leaves the approve gap open | two-way | user R1 | plan |
| D2 | rule | The panel shows one flat list in document order with inline badges and no state groups | Groups by state, which move a row when the user fills it | two-way | user R1 | plan |
| D3 | rule | An unfilled-only toggle hides filled rows and never reorders the rest. The URL keeps its state through `parseAsBoolean` | A second list for unfilled rows, which doubles the panel | two-way | user R1 | plan |
| D4 | rule | A repeated key gets one row at its first place. A key that shows first in a widget gets the place of the widget | One row for each place, which repeats the same item | two-way | user R1 | plan |
| D5 | rule | A filled required row keeps its required badge in the warning tone, next to the filled badge | No badge after a fill, which hides that the item was required | two-way | user R1 | plan |
| D6 | rule | Next and previous visit unfilled required rows only, in document order, and they wrap at the end | Visit every row, which slows the reviewer | two-way | user R1 | plan |
| D7 | rule | The submit warning lists the missing items in document order | The current order of creation, which the inspector cannot follow | two-way | user R1 | plan |
| D8 | rule | The panel highlights the active row and scrolls only its own viewport to keep the row in view | A call to `scrollIntoView`, which also moves the form | two-way | user R1 | plan |
| D9 | rule | In focus mode, next, previous and a row click into another section switch the focused section | A popover over the wrong section, which hides the item | two-way | user R1 | plan |
| D10 | rule | The template tab lists the items in form order, and unused definitions come last | The order of definition, which does not match the form | two-way | user R1 | plan |
| D11 | tech | One pure helper in `@app/types` derives the order on the client. Nobody stores or renumbers `sort_order` | An order by `sort_order` on the server, which autosave breaks | two-way | user R2 | plan |
| D12 | rule | Approve gets a soft gate that lists the missing items in document order, with an approve-anyway tick and a `review_override` row | A hard block, which stops a reviewer who must approve today | two-way | user R3 | plan |
| D13 | rule | Every surface goes through the submit check. REST, MCP and a create in review get the same gate as the app | A check in the app only, which the API skips | two-way | user R3 | plan |
| D14 | rule | A write rejects an item token in a title, a widget configuration, a header or a footer. Export strips any token that gets through | A full list and fill of titles, which no form needs today | two-way | user R4 | plan |
| D15 | tech | A fill of a widget section parses the JSON, replaces the string leaves and writes it back under a lock | A text replace, which breaks the JSON on a quote | two-way | user R3 | plan |
| D16 | rule | A copy of a form clones the definitions without values, so a copy starts unfilled | A copy with values, which carries old answers into a new form | two-way | user R3 | plan |
| D17 | rule | A token with no row counts as a required item that is missing, and the panel says undefined when no definition exists | Ignore the token, which hides an item from both gates | two-way | user R4 | plan |
| D18 | rule | A required token that the reviewer deletes stays non-blocking, and the approve dialog lists it as removed | Block the approve, which stops a valid edit | two-way | user R4 | plan |
| D19 | rule | A move into review needs a reviewer on every surface. A form in review with no reviewer shows the owners an assign action | A data fix, which changes forms that the owner did not ask about | two-way | user R4 | plan |
| D20 | rule | A fill value rejects a brace and control characters. A line break or a tab becomes a space | Accept every value, which corrupts the widget JSON | two-way | user R5 | plan |
| D21 | rule | An image value must point at the storage folder of its own team | A free URL, which reads the files of another team | two-way | user R5 | ABC-375 |
| D22 | rule | The approve dialog shows only when an item is missing, with a review-missing button that goes to the first gap | A dialog on each approve, which trains the reviewer to click through | two-way | user R5 | plan |
| D23 | rule | The reviewer acknowledges again even when the author overrode the gate at submit | Trust the author override, which skips the second check | two-way | user R5 | plan |
| D24 | rule | The details save never sends a status. Only the workflow buttons change the status | A save that sends the status, which reverts a reviewer move | two-way | user R5 | plan |
| D25 | tech | A move between draft and review takes the no-key-update lock. Only approve takes the update lock | One update lock for each move, which blocks autosave | two-way | evidence | the lock test branch |
| D26 | rule | A migration guards direct database writes, and the schema lands before the code | A guard in the code only, which a direct write skips | two-way | user R5 | plan |
| D27 | rule | The partner fill writer uses the same value rule as the app, with new reason codes for a brace and a control character | A separate rule for the partner, which drifts | two-way | delegated | plan |
| D28 | rule | An approved form keeps its approval, and only a future export gets the fixed output | A new approval round for old forms, which no reviewer asked for | two-way | user R5 | plan |
| D29 | rule | The storage scope fix ships as its own PR first, because it is a security fix | Ship it in this PR, which waits on the panel review | two-way | user R3 | ABC-375 |
| D30 | rule | Out-of-scope findings go to the drafts file, and the owner files them with agree | New tickets from the agent, which add tracker noise | two-way | user R5 | plan |
| D31 | rule | The partner fill runs one batched sync of the sections after its fill loop, inside the same transaction | A sync after each fill, which writes each section many times | two-way | delegated | plan |
| D32 | tech | The partner package takes a dependency on `@app/types` for the value rule, not a pinned copy | A pinned copy, which drifts from the app | two-way | delegated | plan |
| D33 | rule | The approve gate never imports the single sign-on bypass of support agents, so a support agent gets the same gate | A bypass for support agents, which skips the check | two-way | user R5 | plan |
| D34 | rule | The override row holds the type of the caller and the token ID, so an audit can tell an API key from a person | A row with the user ID only, which hides the API key | two-way | delegated | plan |
| D35 | rule | Each prompt to measure production data shows its query first, and each query only counts rows | A query that the owner does not see first, which can read customer data | two-way | user R3 | plan |
| D36 | rule | A stale section in the URL falls back to the first section, so focus mode never shows an empty editor | An empty editor, which looks like a lost form | two-way | delegated | plan |

## Sessions

### S1 One PR puts form items in document order and closes the approve gap

State. now
Depends on. None.
Exit.
- Given a form with tied items, when an inspector presses next, then each required item is reached once in document order.
- Given a filled required item, when the list renders, then the row keeps its place and its required badge.
- Given an incomplete form, when a reviewer approves, then the dialog lists each missing item and the server writes an override row.
- Given a REST move into review, when an item is missing, then the call fails with the reason that the app gives.
Proof. `bun run e2e forms.scenario`
Baseline. 3 of 9 scenario checks fail on trunk.

| # | Step | Wave | Lane | Files | Covers | Exit | Proof | Checkpoint |
|---|---|---|---|---|---|---|---|---|
| 1 | Add the document order helper | W1 | a | packages/types/src/item-tokens.ts, packages/types/src/item-tokens.test.ts | D4, D11 | The helper gives each key one dense index in section order | `bun test item-tokens` | report |
| 2 | Render the item panel as one flat list | W2 | a | apps/web/forms/item-panel.tsx, apps/web/forms/item-group-list.tsx | D2, D5 | The list keeps a filled row in its place | `bun run e2e forms.scenario` | approve ui |
| 3 | Sort the submit warning in document order | W2 | b | apps/web/forms/form-header.tsx | D7 | The submit dialog reads the items in form order | `bun run e2e forms-submit.scenario` | report |
| 4 | Add the soft approve gate on the server | W2 | c | packages/db/src/queries/forms-approve.ts, packages/db/src/forms-approve.db.test.ts | D12, D23 | An approve with a missing item and no tick writes nothing | `bun test forms-approve.db` | approve one-way |
| 5 | Add the approve dialog in the app | W3 | a | apps/web/forms/approve-dialog.tsx, apps/web/forms/approve-dialog.test.tsx | D12, D22 | The dialog shows only when an item is missing | `bun test approve-dialog` | approve ui |
| 6 | Write widget fills through a JSON parse | W3 | b | packages/db/src/queries/forms-fill.ts, packages/db/src/forms-fill.db.test.ts | D15, D20 | A quote in a value leaves the widget JSON valid | `bun test forms-fill.db` | report |
| 7 | Copy a form without its values | W3 | c | packages/db/src/queries/forms-copy.ts | D16 | A copy of a filled form starts with every item unfilled | `bun test forms-copy` | report |
| 8 | Gate every surface on the submit check | W4 | a | packages/db/src/queries/forms-status.ts, apps/api/routes/forms.ts | D13, D19, D25 | A REST move into review with a missing item fails with 409 | `bun test forms-status.db` | report |
| 9 | Count tokens with no row as missing | W4 | b | packages/types/src/item-gates.ts | D17, D18 | A token with no row blocks the submit until the user fills it | `bun test item-gates` | report |
| 10 | Reject tokens in titles and widget settings | W4 | c | packages/db/src/queries/forms-write.ts | D14 | A title with a token fails at write with a clear reason | `bun test forms-write` | report |
| 11 | Add the unfilled-only toggle | W5 | a | apps/web/forms/item-toggle.tsx | D3 | A reload keeps the filter, and the order of the rest stays the same | `bun run e2e forms-toggle.scenario` | approve ui |
| 12 | Switch the section in focus mode | W5 | b | apps/web/forms/form-page-content.tsx, apps/web/forms/utils.ts | D9 | Next into another section changes the section and shows the item | `bun run e2e forms-focus.scenario` | report |
| 13 | Highlight the active row | W5 | c | apps/web/forms/item-list-item.tsx | D8 | The active row has aria-current, and the form does not scroll | `bun test item-list-item` | approve ui |
| 14 | Sort the template tab in form order | W5 | d | apps/web/templates/items-block.tsx | D10 | Dragging a section makes the tab order follow it | `bun test items-block` | report |
| 15 | Guard direct database writes with a migration | W6 | a | supabase/migrations/20261008120000_forms_status_guard.sql | D26 | A direct move from draft to approved fails in the database | `bun run db-tests forms-status-guard` | approve one-way |
| 16 | Land the steps and run the whole proof | W7 | integrator | docs/plans/form-order.md | D1 | Every gate is green on the session branch, and the core e2e proves red, green and red | `bun run e2e forms.scenario` | report |

### S2 A separate PR scopes storage reads to the team

State. next
Depends on. None.
Exit.
- Given a file of another team, when an export reads it, then the read fails with 403.
- Given a template import, when it names a file of another team, then the import stops with a clear reason.
Proof. `bun test storage-scope`
Baseline. 34 references point at the folder of another team today.

| # | Step | Wave | Lane | Files | Covers | Exit | Proof | Checkpoint |
|---|---|---|---|---|---|---|---|---|
| 1 | Scope storage reads for the export | W1 | a | packages/storage/src/export-read.ts | D21, D29 | A read of the file of another team fails for the export | `bun test storage-scope/export` | report |
| 2 | Scope storage reads for the import | W1 | b | packages/storage/src/import-read.ts | D21, D29 | A read of the file of another team fails for the import | `bun test storage-scope/import` | report |
| 3 | Write the repair script with a dry run first | W2 | a | tooling/repair-storage-refs.ts | D21 | The dry run lists each reference that it changes, and the owner runs the apply | `bun tooling/repair-storage-refs.ts --dry-run` | approve one-way |

## How each step runs

- Each step starts with a plan of 10 lines or fewer that names its D rows. The step worker builds it in its own worktree and commits on a step branch.
- Each step runs the gates in its worktree. They are `bun format`, `bun lint`, `bun run test` and `bun typecheck`. A database step also runs its `*.db.test.ts` file against the local database.
- A test of a lock or a race uses two connections and a committed seed. It sets a lock timeout of two seconds and cleans up in a finally block. It never uses a rolled-back transaction.
- Step 1 tests the order across sections that are not in alphabetical order. A repeat in a later section keeps its first index. The filled form of a token sits at the same place. The keys `site` and `site_photo` stay separate.
- Step 2 is red first. The worker lands the row attribute and the e2e first, and the e2e must fail on the order check. Then the fix makes it green. Then the worker puts the groups back for a moment, and the e2e goes red again.
- Step 2 adds `data-panel-row-key` to each row. It never reuses `data-item-key`, because the form already uses that name.
- Step 4 gates the approve after the generation step and before the claim of authorship. The gate must throw, because the partner write-back fires when the call returns. The message never says read-only.
- Step 4 keeps the pins in `form-approved-triggers.test.ts` green. A new database test proves three cases. No tick writes nothing. A tick writes one row. A throw rolls the whole call back.
- Step 5 shows the dialog only for an incomplete form. Its button goes to the first gap in document order. The checkpoint shows a screenshot in light and dark.
- Step 6 decodes each source form and encodes for each target with one rewrite helper. It tests a move from prose to a widget and from a widget to prose. The reset paths bump no version today, and the PR body says so.
- Step 7 clones the definitions and strips each inline value. The same rule covers a template that the user makes from a form.
- Step 8 takes the no-key-update lock for a move between draft and review, so autosave does not wait. Approve keeps the update lock. A move from approved to approved throws, because a second approve would send a second write-back.
- Step 8 fixes the two database tests that approve a draft. Each test first sets the form to review with SQL, and then it approves.
- Step 9 makes the panel and both gates treat a present token with no filled row as a required item that is missing. Production holds 0 such tokens today, so the change is a guard.
- Step 10 rejects an item token at write time in a title, a widget setting, a header or a footer. Export strips a token that gets through, so a raw token never prints.
- Step 11 filters in place with a trimmed value. It does not use the incomplete check, because that check would hide unfilled optional rows. The empty state says that every item is filled.
- Step 12 finds the section that owns a key with an exact match, never with a prefix match. When the item is not on the page, it switches the section and looks again for about 60 frames. Then it falls back to a popover in the middle.
- Step 13 adjusts only the scroll of the panel. It never calls `scrollIntoView`, because that call would also move the form.
- Step 14 orders the sections that hold static content by their place in the form, with stable sorts. Unused definitions come last, sorted by `sort_order`.
- Step 15 needs a timestamp later than the newest migration on main. The worker applies it to the local database with `psql -f` and adds its own history row. It never runs a migration repair. The owner pushes it to production before the merge.
- Step 8 updates the comments that say "draft or review to approved" in `form-approved-triggers.ts` and in the API router. The status of a form moves only through the workflow buttons after this step.
- Step 9 widens what the partner can fill, because a hydrated row is a row that the partner fill can reach. The policy of the partner stays the same.
- Step 12 keeps the old focus test at `form-editor.scenario.ts:560-571` green. The e2e also proves that previous wraps from the first item to the last item.
- Step 15 re-issues the trigger of the approval guard byte for byte, or it adds a separate function with its own name. It never reuses the suffix of an old guard.
- Step 15 runs its client-role tests through `form-approval-guard.scenario.ts`. A test with `psql` is optional, and it joins the e2e list of the CI.
- Step 2 seeds the e2e with `sort_order` inverted against the token order across 2 sections. It adds a repeated key and a prefilled required row, so each rule of the order has a case.
- Step 3 changes only the order of the list in the submit dialog. The count, the copy and the acknowledgement stay the same, so the old e2e of the dialog stays green.
- Step 5 sends only the code and the plain message of an error to the app. It needs no change in the error formatter, because the dialog reads the code.
- Step 7 also strips the values from a template that a user saves from a filled form. A test proves that the new template holds definitions and no values.
- Step 11 names the URL parameter `unfilled`. The checkpoint shows the label copy, and the owner can rename both there.
- Step 14 adds a new RTL test beside the block. The test drags a section and then reads the order of the tab.
- Step 4 adds a race test with two connections. Two approves of the same revision run at once, and only one of them writes the approval and the write-back.
- Step 6 extends `form-item-fill.db.test.ts` with a widget section and keeps its old case green. A fake transaction test covers only the lock and the single pass.
- Step 8 adds `form-submit-lock.db.test.ts`. It proves that autosave does not wait on a submit, and that a second submit waits for the first one.
- Step 10 also strips a token from the file name of an export. A test exports a form whose title held a token before this step, and the output has no raw token.
- Step 16 is the integrator lane. It lands the step commits in plan order, runs the scoped gates and fixes each conflict. Then it runs the review over the whole PR diff and the full e2e.
- Each checkpoint posts the package as a PR comment. The package holds a summary of 10 lines or fewer, the D rows, the diffstat and the gate counts. It also holds the red-green-red log and a screenshot for a UI step.
- The drafts file holds the findings that are out of scope. One is the identity of the approver on the server. Others are the audit of status changes through REST, the due dates that REST drops and the autosave version race.

## Proof

- `bun run e2e forms.scenario` passes on the session branch for every form type.
- The core e2e fails on trunk, passes after the fix and fails again when the groups come back.
- `bash tooling/db-tests.sh` passes with 0 skipped tests in the database lane.
- A manual walk on a form with many sections covers the normal mode, the focus mode and the filter.

## Unresolved questions

1. Mark items that never print? Recommended. No, because no form has one today (principle subtract-before-you-add). Rejected. A marker, which adds a state to every row.
2. Ship the migration in this release? Recommended. Yes, with the guard on direct writes only, because the old app then keeps working (principle sequence-verifiable-units). Rejected. A later release, which splits the PR against the owner rule.
3. Send only the changed fields on a details save? Recommended. Yes, as a follow-up, because a stale header today sends old partner values again (principle fix-root-causes). Rejected. Fold it into step 13, which grows the step past its exit.
4. Add a section subtitle to each row? Recommended. Decide at the checkpoint of step 2 on a real form, because the need shows only there (principle prove-it-works). Rejected. Add it now, which adds noise to every row.
