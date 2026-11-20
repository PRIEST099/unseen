You are the lead engineer for THE UNSEEN, a Kiroween 2026 hackathon project. Read `docs/brief/PRODUCT_BRIEF.md` in full first. It is the product vision from the product lead.

Your task now: create the project's **Kiro steering documents** in `.kiro/steering/`. Do NOT write application code yet.

Create these files. Each starts with Kiro steering front matter (`inclusion: always`, or `inclusion: fileMatch` with a `fileMatchPattern`, or `inclusion: manual`) chosen sensibly:

1. `product.md` (always): purpose, audiences, the product surfaces, the non-negotiables (the app itself is WCAG 2.2 AA; effects only on the audited screenshot; truthful speech; no runtime overlay fixes; honest about automated-testing limits).
2. `tech.md` (always): stack and conventions. TypeScript strict, Node 22, npm workspaces, Playwright + axe-core + CDP accessibility tree, Fastify, React + Vite, Vitest + fast-check, MCP TypeScript SDK, one Docker image based on the official Playwright image. Code-style rules (pure functions for the classifier, no `any`, explicit error types), and the testing policy (every pure module gets property-based tests).
3. `structure.md` (always): the monorepo layout (`packages/core`, `packages/mcp`, `apps/web`, `apps/cursed-shop`, `power/`, `docs/`) and what belongs where.
4. `hauntings.md` (always): the complete haunting taxonomy from the brief (name, exact detection rule and data source, visual, sound, WCAG criteria, severity rules) plus the Haunting Score rules (deterministic, monotonic, order-independent). Also the **speech announcement rules**: how role, name and state turn into spoken text, e.g. "Add to cart, button" or just "button" when the name is empty. This is the single source of truth.
5. `design-system.md` (fileMatch on `apps/web/**`): tokens, type (Atkinson Hyperlegible + a display serif for headings only), motion and reduced-motion rules, sound rules, and component accessibility rules (focus visible, labels, live regions, keyboard). Every token pair must meet AA contrast.
6. `security.md` (fileMatch on `packages/core/**` and `apps/web/server/**`): the SSRF rules for the hosted auditor (block private, loopback, link-local and metadata ranges in all encodings, for every request the page makes), timeouts, size limits, rate limit and concurrency cap; and that local URLs are allowed only in the local MCP server.

Keep each file focused, concrete and actionable: rules Kiro must follow when generating code, not marketing. When finished, list the files you created.
