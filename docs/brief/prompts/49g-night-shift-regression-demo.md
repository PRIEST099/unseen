Workspace: `D:\kiroween 2026\night-shift`. Save after each item. Never end with a menu or a question. Hard rules: never approve anything in Crew; never call approval, trust or enable endpoints; never uninstall; never change Crew's config; never touch `../the-unseen`.

## Where things stand (the product lead verified this)
The owner opted into Crew's `hooks.auto_approve_sources: ["cron"]`. The nightly job then ran **fully unattended** at 20:46. Crew's security log shows these, all `auto_approved`:
- the Warden's `validate`
- the Seer's `audit` and `diff` (as `cron:095976da`)
- the Warden's `report`

The report is correct: **0 new hauntings**, because the demo copy has not changed since the last patrol's history. So the Scribe and Exorcist were never needed, and no real crew run has shown them yet.

## 1. A realistic regression for the demo
Add `npm run demo:regress` and `npm run demo:reset`.
- **`demo:regress`** applies one small, realistic "someone shipped this today" change to `demo/cursed-shop-copy/` (for example a new icon-only "Add to wishlist" button on `product.html`). Use a change that creates exactly **one new Wraith Nameless Spirit**. Pick it so that:
  - the obvious `aria-hidden` "fix" is rejected (it creates a Veiled haunting);
  - a real `aria-label` fix is kept.
- **`demo:reset`** restores `demo/cursed-shop-copy/` and `demo/cursed-shop-fixed/` from git, and keeps `.night-shift/history`, so the next patrol has a baseline.

Add a test: after `demo:regress`, `night-shift diff` reports exactly one new Wraith. Document both commands in `demo/README.md`.

## 2. The Morning report must refresh without a rebuild
Today the page shows the report bundled at install time (`ui/src/last-report.json`), so an overnight run never appears.

Find a mechanism **from Crew 0.13.1's installed source or the shipped apps** (`%USERPROFILE%\.kiro\crew\apps\*`) that lets the page read the latest `report.json` at runtime without an exec backend. Candidates:
- Crew's app storage API (`permissions.storage`)
- a file served under `/apps/night-shift/ui/` from the installed copy
- any documented app data route

Cite file and line. Implement it so the `report` MCP tool publishes there, and the page fetches it through the SDK (`useAppApi`, or whatever is real), falling back to the bundled copy. If no mechanism exists without the owner granting something, implement nothing for it, and write down exactly what would be needed.

## 3. Re-sync and test
- **Re-sync:** if `app.json`, the agents or the UI change, the owner must press **Sync** on the app's detail page (Apps → Discover → Night Shift Crew → Sync). Stop and print that as `Next: owner presses Sync`. Do not trigger the patrol yourself.
- **Tests:** run the full suite (unit, integration and typecheck).
