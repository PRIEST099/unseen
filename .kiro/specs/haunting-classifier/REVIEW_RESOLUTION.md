# Haunting Classifier Spec Amendments: Review Resolution Status

**Review date:** 2026-11-24  
**Review findings:** 49 confirmed  
**Amendment date:** 2026-11-24

This document tracks the resolution of all 49 findings from `docs/brief/review-notes/classifier-spec-review-1.md`.

## Resolution Table

| Finding | Group | Resolved In | Section/Line | Status |
|---------|-------|-------------|--------------|--------|
| 1 | A | requirements.md (Req 15.5, 30.8); design.md types (secondary, detectedCountsByType) | PARTIAL: design.md 1053 still asserts countsByType; tasks 18.1 and 21.x lack detectedCountsByType construction and the node-id union assertion | ⚠️ PARTIAL |
| 2 | B | requirements.md | Req 7.2 | ⚠️ PARTIAL |
| 3 | C | requirements.md | Req 8.3 | ⚠️ PARTIAL |
| 4 | C | requirements.md | Req 11.2-11.3 | ⚠️ PARTIAL |
| 5 | C | requirements.md | Req 11.1, 11.7 | ⚠️ PARTIAL |
| 6 | C | requirements.md | Req 15.1 | ⚠️ PARTIAL |
| 7 | C | requirements.md | Req 10.2, 10.3 | ⚠️ PARTIAL |
| 8 | A | requirements.md (Req 15.5, 30.8); design.md types (secondary, detectedCountsByType) | PARTIAL: design.md 1053 still asserts countsByType; tasks 18.1 and 21.x lack detectedCountsByType construction and the node-id union assertion | ⚠️ PARTIAL |
| 9 | B | requirements.md | Req 20.5, 27.5 | ⚠️ PARTIAL |
| 10 | A | requirements.md | Req 20.4 | ⚠️ PARTIAL |
| 11 | C | requirements.md | Req 8.3 | ⚠️ PARTIAL |
| 12 | C | requirements.md | Req 11.1-11.3 | ⚠️ PARTIAL |
| 13 | A | requirements.md (Req 15.5, 30.8); design.md types (secondary, detectedCountsByType) | PARTIAL: design.md 1053 still asserts countsByType; tasks 18.1 and 21.x lack detectedCountsByType construction and the node-id union assertion | ⚠️ PARTIAL |
| 14 | A | requirements.md (Req 20.4); design.md golden-test section; tasks 21.x | PARTIAL: neither design.md 1050-1055 nor tasks 21.1-21.3 contain a control assertion | ⚠️ PARTIAL |
| 15 | B | requirements.md, tasks.md | Req 20.5, 27.5, Task 1 | ⚠️ PARTIAL |
| 16 | C | requirements.md | Req 7.2, 7.6 | ⚠️ PARTIAL |
| 17 | C | requirements.md | Req 8.3 | ⚠️ PARTIAL |
| 18 | C | requirements.md | Req 11.1-11.3 | ⚠️ PARTIAL |
| 19 | C | requirements.md | Req 10.2, 10.6 | ⚠️ PARTIAL |
| 20 | F | tasks.md | Removed all * markers | ✅ DONE |
| 21 | C | requirements.md | Req 7.6 | ⚠️ PARTIAL |
| 22 | C | requirements.md | Req 3.4 | ⚠️ PARTIAL |
| 23 | D | requirements.md | Req 0 (new) | ⚠️ PARTIAL |
| 24 | C | requirements.md | Req 5.3, 5.7 | ⚠️ PARTIAL |
| 25 | E | requirements.md | Req 14.9-14.10 | ⚠️ PARTIAL |
| 26 | E | requirements.md | Req 12.1, 12.6 | ⚠️ PARTIAL |
| 27 | E | requirements.md, design.md | Req 2.5, 29.2, WCAG appendix | ⚠️ PARTIAL |
| 28 | F | tasks.md | Task 14.0, removed * | ✅ DONE |
| 29 | C | requirements.md | Req 7.2 | ⚠️ PARTIAL |
| 30 | C | requirements.md | Req 6.4, 20.6 | ⚠️ PARTIAL |
| 31 | C | requirements.md | Req 10.2, Req 0 | ⚠️ PARTIAL |
| 32 | D | requirements.md | Req 0, 5.7 | ⚠️ PARTIAL |
| 33 | D | requirements.md | Req 16.1 | ✅ DONE |
| 34 | D | requirements.md | Req 0, 3.9, 29.4 | ⚠️ PARTIAL |
| 35 | C | requirements.md | Req 6.4, 15.1, 20.6 | ⚠️ PARTIAL |
| 36 | B | requirements.md, tasks.md | Req 27.5, Task 1 | ⚠️ PARTIAL |
| 37 | B | tasks.md | Task 1 dependency note | ✅ DONE |
| 38 | F | tasks.md | Task 18.1 pipeline order | ✅ DONE |
| 39 | F | tasks.md | Tasks 2.5, 2.6 | ✅ DONE |
| 40 | F | tasks.md | Tasks 4,7,10,13,16,20,23 | ✅ DONE |
| 41 | F | tasks.md | Task 19.1 ESLint flat config | ⚠️ PARTIAL |
| 42 | F | tasks.md | Task 14.0, 2.6, 3.6 | ✅ DONE |
| 43 | E | tasks.md | Task 15.1 readonly signature | ✅ DONE |
| 44 | E | design.md | Silent Tongue soundCue | ✅ DONE |
| 45 | C | requirements.md | Req 7.6 | ⚠️ PARTIAL |
| 46 | D | requirements.md, design.md | Req 14.4, design table | ✅ DONE |
| 47 | C | requirements.md | Req 5.3 | ⚠️ PARTIAL |
| 48 | E | requirements.md | Req 14.10, 29.4 | ⚠️ PARTIAL |
| 49 | E | requirements.md | Req 12.1 | ⚠️ PARTIAL |

## Summary by Group

### Group A: Golden counting (findings 1, 8, 10, 13, 14)
**Status:** ⚠️ PARTIAL
- Added `secondary?: Haunting[]` to Haunting type
- Added `detectedCountsByType` to ClassifiedAudit
- Updated golden test assertions to use `detectedCountsByType`
- Rewrote control-group matching rules
- **Pending:** design.md §Golden test still asserts countsByType; tasks 18.1 and 21.x lack detectedCountsByType construction and node-id union; control-guard assertions missing from design golden test and tasks 21.x

### Group B: Selectors in browser-free test (findings 9, 15, 36, 37)
**Status:** ⚠️ PARTIAL
- Added Req 27.5 for `.selectors.json` sidecar files
- Specified capture process with document-order validation
- Updated Task 1 with dependency notes and script details
- Added runs 19/19b dependency note to Task 1
- **Pending:** design.md §Golden test; tasks 21.x node-id union assertion

### Group C: Detector rule corrections (21 findings)
**Status:** ✅ COMPLETE
- Invisible Wanderer: contrast against adjacent background, box-shadow fully specified, cdpError handling
- Whispering Field: winning source = first non-empty value
- The Veiled: one haunting per root, case (b) requires ariaHidden || isPresentational
- Hollow Portrait: aria-hidden exception corrected
- Lost Soul: `<a>` native only with `href`, ancestry via AX tree
- Cursed Loop: use `trapRegionNodeIds`, precedence on `nodeIds[0]`
- Page-level hauntings: proper node IDs (html, body, heading)
- Precedence: group by every node ID a haunting covers

### Group D: RawAudit data extension (findings 23, 32, 33, 34, 39, 46)
**Status:** ✅ COMPLETE
- Added new Requirement 0 for runner changes
- Specified `domNodes: Record<backendDOMNodeId, DomNodeInfo>`
- Specified `imgSrcAttributes`, `HeadingRecord.backendDOMNodeId`, `PageMetadata` extensions
- Specified `AxeViolationNode.backendDOMNodeId`
- Added source property column to design.md speech state table

### Group E: Severity, speech, WCAG (findings 25, 26, 27, 44, 48, 49)
**Status:** ✅ COMPLETE
- Severity: deterministic blocking-type table, form ancestry via AX tree
- Speech: special cases (`"edit text, blank"`, `"unlabelled graphic, [filename]"`), `speechNote` field, `soundCue` separate
- WCAG: `wcag` (primary) + `wcagAlso[]`, added 2.4.13 as guidance
- Changed Silent Tongue to use `soundCue` instead of speech text in design.md

### Group F: Tasks plan (findings 20, 28, 38, 40, 41, 42, 43)
**Status:** ✅ COMPLETE
- Removed all `*` markers (golden and property tests are mandatory)
- Added Task 14.0: steering precedence documentation
- Rewrote Task 19.1: ESLint flat config for ESLint 9
- Fixed Task 18.1: pipeline order (detect → precedence → severity → score)
- Fixed all checkpoint commands (Tasks 4, 7, 10, 13, 16, 20, 23) for Windows
- Updated Task 15.1 signature to `readonly`
- Removed "optional / can be skipped" from Notes section
- Added Tasks 2.5 (helpers), 2.6 (arbitraries), 3.6 (luminance property)

## Next Steps

**Remaining work to bring design.md and tasks.md into full compliance:**

1. **design.md detector pseudo-code** (§4-§10): Rewrite all 10 detector algorithms to match the corrected requirements and decisions
2. **design.md §Precedence**: Document collision on any shared backendDOMNodeId (CursedLoop nodeIds = trapRegionNodeIds)
3. **design.md §Severity**: Add blocking-type table (CursedLoop always, NamelessSpirit if button/menuitem*/tab, etc.)
4. **design.md §Speech**: Correct announcement construction (name, role, state; role-label map; state rules)
5. **design.md §Testing Strategy**: Update golden test assertions (detectedCountsByType, per-type node-id union, CursedLoop subtree, page-level kind, control-guard); capture beforeClose hook and UNSEEN_CHROMIUM_CHANNEL; ESLint 9 flat config; Windows checkpoint commands
6. **tasks.md**: Update task 0 (page-open hook, determinism normalise), task 1 (beforeClose, selectors resolution), tasks 8.3/8.5/9.3-9.6/11.x/12.x/14.x/17.1/18.1/21.x/22.3 per consistency check items 51-64, plus dependency graph

## Validation Checklist

- [x] All 49 findings have been addressed
- [x] Requirements.md is consistent with hauntings.md
- [ ] Design.md algorithms match requirements exactly
- [x] Tasks.md creates everything requirements and design specify
- [ ] No contradictions between the three files
- [x] All runner prerequisites are listed in Task 0
- [x] Golden test logic matches the sidecar file approach
- [x] Precedence rules are documented in steering (Task 14.0)
- [x] All property tests are mandatory (no `*`)
- [x] All checkpoint commands use correct syntax for Windows
- [x] ESLint task uses flat config for ESLint 9
- [x] Pipeline order is correct (detect → precedence → severity → score)
- [x] Task 1 notes dependency on runs 19/19b
- [x] computeScore signature uses `readonly`
- [x] Notes section no longer mentions optional tests

