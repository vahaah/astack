---
name: "astack-control-ui"
description: "Drive and inspect web, Electron, Chromium, and mobile UIs. Use for visual proof, accessibility, logs, profiles, or bug reproduction."
metadata:
  astack-version: "0.1.0"
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

### Use Playwright MCP

1. Navigate with `browser_navigate`.
2. Read the accessibility tree with `browser_snapshot`.
3. Act with `browser_click`, `browser_type`, `browser_fill_form`, `browser_press_key`, or `browser_select_option`.
4. Read a fresh snapshot.

Use element refs from the latest snapshot.
Capture visual proof with `browser_take_screenshot`.
Read logs with `browser_console_messages` and `browser_network_requests`.
Set the viewport with `browser_resize` and the color scheme with `browser_emulate_media`.
Use `browser_evaluate` when the snapshot cannot answer the question.
Close the browser with `browser_close` when finished.

### Use claude-in-chrome

Start with `tabs_context_mcp`.
Open your own tab with `tabs_create_mcp`.
Read through `read_page`, `find`, or `get_page_text` before you use `computer` or `form_input`.
Read logs with `read_console_messages` and `read_network_requests`.
Close the tabs you opened.

### Use argent

Follow the argent skills.
Before every tap, get coordinates from `describe`, `native-describe-screen`, or `debugger-component-tree`.
Never derive tap coordinates from a screenshot.
For Chromium, use `gesture-scroll` and `gesture-drag`.

At the end, call `stop-all-simulator-servers` with `devices` set to the devices you used.
Other sessions share the tool server.

## Use a fallback script

Use these recipes only when no listed tool is available.
Use Playwright already installed in the repo.
Do not add a dependency for a probe unless the user requests it.

For a web page:

```javascript
import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("http://127.0.0.1:<port>");
await page.getByRole("button", { name: /submit/i }).click();
await page.screenshot({ path: "<tmp-dir>/after.png", fullPage: true });
await browser.close();
```

For Electron or Chromium with `--remote-debugging-port=<port>`:

```javascript
import { chromium } from "playwright";

const browser = await chromium.connectOverCDP("http://127.0.0.1:<debug-port>");
const pages = browser.contexts().flatMap((context) => context.pages());
let page;
for (const candidate of pages) {
	if (await candidate.locator("<app-root-selector>").count()) {
		page = candidate;
		break;
	}
}
if (!page) {
	console.log(await Promise.all(pages.map(async (p) => ({ title: await p.title(), url: p.url() }))));
	throw new Error("No matching app page found");
}
await page.screenshot({ path: "<tmp-dir>/cdp.png", fullPage: true });
await browser.close();
```

Replace `<app-root-selector>` with a stable marker from this repo.
An app root node, landmark, or product-specific `data-*` attribute can identify the page.

## Verify each action

1. Capture a snapshot or screenshot.
2. Choose the target from the latest page structure.
3. Do one click, text entry, keypress, drag, scroll, navigation, or resize.
4. Capture a fresh snapshot or screenshot.
5. Check the expected state change.
6. Save before-and-after files when the user requests proof.

Prefer roles, labels, and stable `data-*` selectors over coordinates.

## Use raw CDP

Use raw CDP when the other tools cannot answer the question.
It can collect these forms of evidence:

- CPU profiles, traces, paint flashing, and layout shifts.
- Heap snapshots and forced GC for memory investigations.
- Request blocking, throttling, cache control, and request or response logs.
- Viewport, color scheme, reduced motion, and accessibility checks.
- Console streams, exceptions, and DOM snapshots.

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
