---
inclusion: auto
name: wcag-reference
description: WCAG 2.2 success criteria used by THE UNSEEN, with levels and W3C Understanding links
---

# WCAG 2.2 Reference for THE UNSEEN

This table lists the WCAG 2.2 success criteria that THE UNSEEN detects and reports. For detailed haunting definitions and detection rules, see #[[file:.kiro/steering/hauntings.md]].

| SC | Level | Name | What it means | Understanding URL |
|----|-------|------|---------------|-------------------|
| 1.1.1 | A | Non-text Content | Images, icons, and other non-text content must have text alternatives | https://www.w3.org/WAI/WCAG22/Understanding/non-text-content |
| 1.3.1 | A | Info and Relationships | Information, structure, and relationships conveyed through presentation must be programmatically available | https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships |
| 1.4.3 | AA | Contrast (Minimum) | Text must have at least 4.5:1 contrast ratio (3:1 for large text) | https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum |
| 2.1.1 | A | Keyboard | All functionality must be operable through keyboard | https://www.w3.org/WAI/WCAG22/Understanding/keyboard |
| 2.1.2 | A | No Keyboard Trap | Keyboard focus can be moved away from any component using only keyboard | https://www.w3.org/WAI/WCAG22/Understanding/no-keyboard-trap |
| 2.4.4 | A | Link Purpose (In Context) | The purpose of each link can be determined from link text alone or from link text with its programmatically determined context | https://www.w3.org/WAI/WCAG22/Understanding/link-purpose-in-context |
| 2.4.6 | AA | Headings and Labels | Headings and labels describe topic or purpose | https://www.w3.org/WAI/WCAG22/Understanding/headings-and-labels |
| 2.4.7 | AA | Focus Visible | Keyboard focus indicator is visible | https://www.w3.org/WAI/WCAG22/Understanding/focus-visible |
| 2.4.13 | AAA | Focus Appearance | Focus indicator meets minimum size and contrast (guidance only, not enforced) | https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance |
| 3.1.1 | A | Language of Page | The default human language of each page can be programmatically determined | https://www.w3.org/WAI/WCAG22/Understanding/language-of-page |
| 3.3.2 | A | Labels or Instructions | Labels or instructions are provided when content requires user input | https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions |
| 4.1.2 | A | Name, Role, Value | For all UI components, the name and role can be programmatically determined; states, properties, and values can be programmatically set and notified to user agents | https://www.w3.org/WAI/WCAG22/Understanding/name-role-value |

## Notes

- **2.4.13 Focus Appearance** is AAA and used as guidance for Invisible Wanderer detection, not as a hard requirement.
- **Automated checking limitations:** THE UNSEEN detects approximately 30-40% of WCAG issues. Many criteria require manual testing (reading order, meaningful sequence, error identification, focus order logic, etc.).
- **Severity mapping:** Level A failures are always Restless or Wraith. Level AA failures may be Banished if they affect a single non-critical element.

## Haunting-to-WCAG mapping

See #[[file:.kiro/steering/hauntings.md]] for the definitive mapping:

- **Nameless Spirit** → 4.1.2, 2.4.4, 1.1.1 (image buttons)
- **Hollow Portrait** → 1.1.1
- **The Fog** → 1.4.3
- **Lost Soul** → 2.1.1, 4.1.2
- **Cursed Loop** → 2.1.2
- **Invisible Wanderer** → 2.4.7 (primary), 2.4.13 (guidance)
- **Whispering Field** → 1.3.1, 3.3.2, 4.1.2
- **Silent Tongue** → 3.1.1
- **Shattered Order** → 1.3.1, 2.4.6 (best practice)
- **The Veiled** → 1.3.1, 4.1.2
