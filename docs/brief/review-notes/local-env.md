# Local environment notes (Windows dev machine)

- Playwright 1.65.1. The full Chromium build `chromium-1255` is installed, but the **headless shell (`chromium_headless_shell-1255`) download fails** on this machine (two attempts). Use the full build in headless mode instead: `chromium.launch({ channel: 'chromium', headless: true })`.
- Requirement for `BrowserPool` (audit-engine task 5): make the channel configurable through `UNSEEN_CHROMIUM_CHANNEL`. Default to `'chromium'` locally. The Docker image (official Playwright base) can use either.
