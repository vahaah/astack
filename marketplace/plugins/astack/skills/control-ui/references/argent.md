# Use argent

Follow the argent skills.
Before every tap, get coordinates from `describe`, `native-describe-screen`, or `debugger-component-tree`.
Never derive tap coordinates from a screenshot.
For Chromium, use `gesture-scroll` and `gesture-drag`.

At the end, call `stop-all-simulator-servers` with `devices` set to the devices you used.
Other sessions share the tool server.
