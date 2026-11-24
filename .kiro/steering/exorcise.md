---
inclusion: manual
---

# Exorcise Workflow

This steering file defines the on-demand "Exorcise" workflow. Invoke it with `#exorcise` when the product lead gives you a URL to fix.

## Goal

Audit a URL, fix hauntings in the **source code** (never with a runtime overlay or injected script), re-audit, and repeat until the user stops or the site is clean.

## Steps

1. **Audit the target URL**
   - Use `auditUrl()` from `packages/core` (once implemented), or the MCP `audit_url` tool (once the unseen-mcp server is enabled).
   - Record the initial Haunting Score and the full list of hauntings by type and severity.

2. **Identify the highest-severity haunting**
   - Priority order: Wraith > Restless > Banished.
   - Within the same severity, prioritize by haunting type precedence (Cursed Loop > Nameless Spirit > Whispering Field > Lost Soul > Hollow Portrait > The Veiled > Invisible Wanderer > The Fog > Shattered Order > Silent Tongue).
   - If multiple instances of the same type and severity exist, pick the first in DOM order.

3. **Fix the haunting in source code**
   - Locate the HTML element via the `backendDOMNodeId` or CSS selector from the haunting report.
   - Apply the minimal WCAG-compliant fix:
     - **Nameless Spirit:** Add an `aria-label`, visible text content, or `<label>` association.
     - **Hollow Portrait:** Add a descriptive `alt` attribute (or `alt=""` if truly decorative).
     - **The Fog:** Adjust text or background color to meet 4.5:1 or 3:1 contrast.
     - **Lost Soul:** Add `tabindex="0"` and an appropriate ARIA role, or replace with a semantic interactive element (`<button>`, `<a>`).
     - **Cursed Loop:** Ensure the modal or widget is escapable via `Escape` key, or fix the focus trap logic.
     - **Invisible Wanderer:** Add or strengthen the `:focus-visible` indicator (outline, box-shadow, or background change with ≥3:1 contrast).
     - **Whispering Field:** Add a `<label>` or `aria-label`; never rely on placeholder alone.
     - **Silent Tongue:** Add or correct the `lang` attribute on `<html>`.
     - **Shattered Order:** Add a `<main>` landmark, insert the missing heading level, or add an `<h1>`.
     - **The Veiled:** Remove `aria-hidden="true"` from interactive or visible-text content, or use `role="presentation"` correctly.
   - **Never inject a fix at runtime.** Edit the source HTML, CSS, or JavaScript that generates the element.

4. **Re-audit and report**
   - Run the audit again on the same URL.
   - Report:
     - Before score: `<number>`
     - After score: `<number>`
     - Change: `<+/- delta>`
     - Haunting fixed: `<type>` on `<element description>`
     - Remaining hauntings: `<count>` (Wraith: X, Restless: Y, Banished: Z)

5. **Repeat**
   - If hauntings remain and the user has not stopped you, go to step 2.
   - If the score is 0 or the user says stop, end with a summary: total hauntings fixed, final score, and any notes (e.g., manual checks still required).

## Rules

- **Source fixes only.** No overlays, no injected scripts, no browser extensions. We show developers how to fix their code, not how to patch it at runtime.
- **Minimal changes.** Fix the specific haunting without refactoring unrelated code.
- **WCAG compliance.** Every fix must meet the relevant WCAG 2.2 criterion listed in `hauntings.md`.
- **Fail forward.** If a fix does not reduce the score, investigate why (secondary haunting? overlapping issue?), log it, and move to the next haunting. Never retry the same fix without changing the approach.

## Example invocation

```
#exorcise
Target URL: https://example.com/checkout
```

You would then:
1. Audit `https://example.com/checkout`.
2. Find the highest-severity haunting (e.g., a Wraith Nameless Spirit on the "Complete Purchase" button).
3. Fix it (add `aria-label="Complete Purchase"` or visible button text).
4. Re-audit and report the score change.
5. Repeat.

## Notes

- This workflow is for **demonstration and testing**, not for production use on third-party sites without permission.
- For the cursed-shop demo, the source is local HTML files. For external URLs, you will need read access to the source repository or codebase.
- The workflow assumes you have already implemented the audit engine (`packages/core`) and that it is callable via the API or MCP.
