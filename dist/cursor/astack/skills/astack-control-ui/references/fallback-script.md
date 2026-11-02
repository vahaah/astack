# Use a fallback script

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
