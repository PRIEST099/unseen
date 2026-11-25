# Demo: Kiro cannot finish a UI task while a ghost is in it

This is the 1:10 to 1:50 segment of the video. It is recorded in the **Kiro IDE**. It is deterministic: the workspace starts with a haunted page, so the beat does not depend on what the model decides to write.

Automated checks find roughly 30-40% of WCAG issues. This demo shows the audit loop; it does not say a page is complete.

## Prerequisites (do them in this order)

1. `npx playwright install chromium`
2. In the THE UNSEEN repository root: `npm run unseen:install-global`. This packs `@the-unseen/core` and `@the-unseen/mcp` and installs both globally. Nothing is published to npm. Check with `unseen-mcp --help`. On Windows set `UNSEEN_CHROMIUM_CHANNEL=chromium` in the environment Kiro starts from.
3. Open an empty demo workspace in Kiro and **trust the workspace**. Until it is trusted, Kiro does not load skills or MCP configuration.
4. Copy `power/demo/checkout.html` into the demo workspace root.
5. Import the Power: Powers panel, "Add Custom Power", "Import power from a folder", choose this `power/` folder. The server appears as `power-the-unseen-unseen`.
6. In the demo workspace run `unseen-mcp install-hooks` (or ask Kiro to use the `install-unseen-hooks` skill) and **approve the writes** into `.kiro/hooks/`.
7. Delete `.unseen/` in the demo workspace if it exists, so no old gate state is left.
8. Start a **new** chat session. Hooks start with a session.

## Approval prompts to expect while recording

- The writes into `.kiro/hooks/` (step 6).
- The first call of each `power-the-unseen-unseen` tool (`audit_html` or `audit_url`). A Power cannot auto-approve tools, so approve each one. Approve them once before recording if the prompt would interrupt the take.
- The hook trust prompt, if Kiro shows one for the new hooks.

## The starting page

`checkout.html` has an icon-only `<button class="checkout">` that holds only an SVG. It has no accessible name, so a screen reader says only "button". Because the button has the `checkout` class it sits on a core task path, so it is a **Wraith** Nameless Spirit. The page has a `lang`, an `h1` and a `main`, so nothing else is wrong with it.

- Score before: **15**
- Score after the fix: **0**

(These numbers come from running the fixture, and a test checks them.)

## Steps

1. **Prompt.** Type exactly: `Add a quantity selector next to the checkout button in checkout.html.`
2. **Kiro edits the page.** On save, the on-save hook prints a line such as `THE UNSEEN: 1 new haunting: Nameless Spirit (Wraith) on button (score 15).` In the IDE this output reaches the agent. (In the Kiro CLI it is informational only.)
3. **Kiro tries to finish.** The Stop hook (the ghost gate) re-audits the changed page. The button was already a ghost, and Kiro touched the page, so the ghost stays Kiro's problem. The gate exits 1 and writes the instruction to stderr, which ends: `Fix the source, call audit_url (or audit_html) on the same page, and report the before score 15 and the new score before finishing.`
4. **Kiro fixes the source.** It gives the button an accessible name, for example `aria-label="Checkout"`, or visible text. It calls `audit_html` (or `audit_url`) on the same page and reports before and after: 15 to 0.
5. **Kiro ends its turn.** The gate re-audits and prints, for the user: `THE UNSEEN: gate passed (score 0, before 15).` The turn ends.

Expected tool calls: `audit_html` or `audit_url` (once or twice), file edits to `checkout.html`.

## If the IDE does not keep working after the gate exits 1

The documented behaviour is that exit code 1 with the instruction on stderr is sent to the agent. If this IDE version does not start a new turn, switch to the fallback entry in `.kiro/hooks/unseen-hooks.json`:

1. Set `"enabled": false` on the Stop entry named `THE UNSEEN ghost gate`, or remove it.
2. Set `"enabled": true` on the Stop entry named `THE UNSEEN ghost gate (agent fallback)`.
3. Start a new chat session.

The agent entry asks Kiro to run the gate shim and keep fixing. It costs credits on every turn, so switch it back after the take.

## Recovery

- **Nothing happens on the gate.** Check that `.kiro/hooks/unseen-hooks.json` exists, that you started a new chat session after installing it, and that `checkout.html` was saved after the last gate pass. A file counts as changed when its modification time is newer than the last pass in `.unseen/gate-state.json`.
- **The gate says it gave up.** After 5 blocks in a row it stops. Delete `.unseen/` and start a new chat session.
- **`unseen-mcp` is not found.** Run `npm run unseen:install-global` again and open a new terminal.
- **A browser error.** Run `npx playwright install chromium` and set `UNSEEN_CHROMIUM_CHANNEL=chromium` on Windows.
- **You use a dev server.** Set `UNSEEN_DEV_URL` (for example `http://localhost:5173/checkout.html`). When it is set and reachable, the gate audits it. Otherwise it audits the changed `.html` files.
- **Reset between takes.** Copy `power/demo/checkout.html` over the demo copy and delete `.unseen/`.
