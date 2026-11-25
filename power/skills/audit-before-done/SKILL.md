---
name: audit-before-done
description: Audit every UI you build or change (HTML, React, Vue, Svelte, CSS, buttons, forms, links, images, components) with the unseen audit_url or audit_html tool before saying the task is done. Use whenever you create or edit user interface code.
---

# Audit before done

THE UNSEEN shows what a screen-reader or keyboard-only user meets on a page. These four rules apply to every UI task.

1. Audit every UI you build or change before saying the task is done. Call `audit_url` on the running page, or `audit_html` with the page source when no server is running.
2. Never ship a Nameless Spirit (a control with no accessible name), a Whispering Field (a form field with no label, or only a placeholder) or a Cursed Loop (a keyboard trap).
3. Fix the source. Never inject an overlay, a script or a runtime patch into the page.
4. Re-audit after fixing and report the before and after Haunting Score.

## How

- Run the audit and read the top hauntings. Each one has a selector, the HTML snippet and a source-level fix.
- Fix the highest severity first (Wraith, then Restless, then Banished).
- Call the audit again on the same page. Report: before score, new score, which hauntings were fixed, which remain.
- Say what the audit cannot decide. Automated checks find roughly 30-40% of WCAG issues, so manual testing with a keyboard and a screen reader is still needed. Do not describe the page as passing or complete.

## If the ghost gate blocks you

The Stop hook installed by `unseen-mcp install-hooks` re-audits changed pages before you finish. If it lists hauntings, fix the source, call `audit_url` (or `audit_html`) on the same page, and report the before score and the new score before finishing.
