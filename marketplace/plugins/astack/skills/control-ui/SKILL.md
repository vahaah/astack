---
name: control-ui
description: "Drive and inspect web, Electron, Chromium, and mobile UIs. Use for visual proof, accessibility, logs, profiles, or bug reproduction."
---

# Control UI

Verify UI behavior in a real browser or device.
Use the repo's Playwright tests, Storybook, browser scripts, or Electron scripts first.
Otherwise choose a tool below.

## When to use it

- Reproduce behavior that depends on focus, keys, scrolling, resize, or rendering.
- Check visual or accessibility changes with screenshots and snapshots.
- Verify local web, Electron, or mobile behavior before release.
- Capture console logs, network logs, CPU profiles, traces, or heap snapshots.
- Save evidence before and after a change.

## Choose the tool

| Target | Tool | First steps |
|---|---|---|
| A local or remote web page without personal login | Playwright MCP, `mcp__plugin_playwright_playwright__*` | Load the required browser tools with one ToolSearch call. Start the app with its dev command. |
| A page that needs the user's Chrome cookies, SSO, or extensions | claude-in-chrome, `mcp__claude-in-chrome__*` | Read the `claude-in-chrome` skill first. Follow its site permission steps. |
| Electron, Chromium with `--remote-debugging-port`, iOS, Android, or a TV device | argent, `mcp__argent__*` | Read `argent-device-interact` first. Load the target's setup or workflow skill. Call `list-devices` first. |
| No listed tool is available | A local Playwright or CDP script | Use the repo's installed Playwright. |

For argent, load `argent-ios-simulator-setup`, `argent-android-emulator-setup`, `argent-react-native-app-workflow`, or `argent-tv-interact` as the target needs.

When two tools fit, prefer Playwright for a public page.
Use claude-in-chrome when the task needs the user's session.
Do not post, buy, send, or change account settings in that session without the user's request.

Read the reference for the tool that you chose, and no other tool reference:

- Playwright MCP: `references/playwright.md`.
- claude-in-chrome: `references/claude-in-chrome.md`.
- argent: `references/argent.md`. Never derive tap coordinates from a screenshot.
- A local Playwright or CDP script, when no listed tool is available: `references/fallback-script.md`.
- Raw CDP, when the other tools cannot answer the question: `references/raw-cdp.md`.

## Verify each action

1. Capture a snapshot or screenshot.
2. Choose the target from the latest page structure.
3. Do one click, text entry, keypress, drag, scroll, navigation, or resize.
4. Capture a fresh snapshot or screenshot.
5. Check the expected state change.
6. Save before-and-after files when the user requests proof.

Prefer roles, labels, and stable `data-*` selectors over coordinates.

## Identify the page

When several pages share a debug port, match a positive marker for the target.
Add a negative marker when needed to exclude another page.
If nothing matches, report page titles and URLs.
Do not guess.

## Keep the run isolated

Do not reuse element refs after navigation or a structural change.
Use coordinates only after a fresh screenshot, and never on argent targets.
Keep test data local and disposable.
Do not save private screenshots or heap snapshots without the user's agreement.
Find selectors, ports, and script paths in the current repo.

Stop the dev servers, debug sessions, browsers, and temporary profiles you started.
