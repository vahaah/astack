# Use Playwright MCP

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
