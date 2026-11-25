---
name: exorcise
description: Fix the accessibility hauntings found by the unseen audit, one at a time, in the source code, re-auditing after each fix. Use when asked to exorcise, fix accessibility issues, or clear hauntings on a page.
---

# Exorcise

Fix hauntings in the source, one at a time, and prove each fix with a re-audit.

1. Audit the page with `audit_url` (or `audit_html` with the source). Record the score and the list of hauntings.
2. Take the highest-severity haunting (Wraith, then Restless, then Banished). Within one severity use this order: Cursed Loop, Nameless Spirit, Whispering Field, Lost Soul, Hollow Portrait, The Veiled, Invisible Wanderer, The Fog, Shattered Order, Silent Tongue.
3. Call `explain_haunting` for its type if you need the reason, and `suggest_fix` with its id for the fix in HTML, React or Vue syntax.
4. Edit the source file that produces the element. Make the smallest change that fixes it. Never inject a script, an overlay or a runtime DOM patch.
5. Audit the same page again. Report the before score, the new score and the haunting you fixed.
6. If the score did not drop, find out why (a second haunting on the same element, a different element) and note it. Do not repeat the same fix.
7. Repeat until the user stops you or no hauntings remain. Finish with the total fixed, the final score and the checks that still need a person: automated checks find roughly 30-40% of WCAG issues.
