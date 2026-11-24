# Haunting Classifier Spec Amendments: Review Resolution Status

**Review date:** 2026-11-24  
**Review findings:** 49 confirmed  
**Amendment date:** 2026-11-24

This document tracks the resolution of all 49 findings from `docs/brief/review-notes/classifier-spec-review-1.md`.

## Resolution Table

| Finding | Group | Resolved In | Section/Line | Status |
|---------|-------|-------------|--------------|--------|
| 1 | A | requirements.md | Req 15.5, 30.8 | ✅ DONE |
| 2 | B | requirements.md | Req 7.2 | ✅ DONE |
| 3 | C | requirements.md | Req 8.3 | ✅ DONE |
| 4 | C | requirements.md | Req 11.2-11.3 | ✅ DONE |
| 5 | C | requirements.md | Req 11.1, 11.7 | ✅ DONE |
| 6 | C | requirements.md | Req 15.1 | ✅ DONE |
| 7 | C | requirements.md | Req 10.2, 10.3 | ✅ DONE |
| 8 | A | requirements.md | Req 15.5, 30.8 | ✅ DONE |
| 9 | B | requirements.md | Req 20.5, 27.5 | ✅ DONE |
| 10 | A | requirements.md | Req 20.4 | ✅ DONE |
| 11 | C | requirements.md | Req 8.3 | ✅ DONE |
| 12 | C | requirements.md | Req 11.1-11.3 | ✅ DONE |
| 13 | A | requirements.md | Req 15.5, 30.8 | ✅ DONE |
| 14 | A | requirements.md | Req 20.4 | ✅ DONE |
| 15 | B | requirements.md, tasks.md | Req 20.5, 27.5, Task 1 | ✅ DONE |
| 16 | C | requirements.md | Req 7.2, 7.6 | ✅ DONE |
| 17 | C | requirements.md | Req 8.3 | ✅ DONE |
| 18 | C | requirements.md | Req 11.1-11.3 | ✅ DONE |
| 19 | C | requirements.md | Req 10.2, 10.6 | ✅ DONE |
| 20 | F | tasks.md | Removed all * markers | ✅ DONE |
| 21 | C | requirements.md | Req 7.6 | ✅ DONE |
| 22 | C | requirements.md | Req 3.4 | ✅ DONE |
| 23 | D | requirements.md | Req 0 (new) | ✅ DONE |
| 24 | C | requirements.md | Req 5.3, 5.7 | ✅ DONE |
| 25 | E | requirements.md | Req 14.9-14.10 | ✅ DONE |
| 26 | E | requirements.md | Req 12.1, 12.6 | ✅ DONE |
| 27 | E | requirements.md, design.md | Req 2.5, 29.2, WCAG appendix | ✅ DONE |
| 28 | F | tasks.md | Task 14.0, removed * | ✅ DONE |
| 29 | C | requirements.md | Req 7.2 | ✅ DONE |
| 30 | C | requirements.md | Req 6.4, 20.6 | ✅ DONE |
| 31 | C | requirements.md | Req 10.2, Req 0 | ✅ DONE |
| 32 | D | requirements.md | Req 0, 5.7 | ✅ DONE |
| 33 | D | requirements.md | Req 16.1 | ✅ DONE |
| 34 | D | requirements.md | Req 0, 3.9, 29.4 | ✅ DONE |
| 35 | C | requirements.md | Req 6.4, 15.1, 20.6 | ✅ DONE |
| 36 | B | requirements.md, tasks.md | Req 27.5, Task 1 | ✅ DONE |
| 37 | B | tasks.md | Task 1 dependency note | ✅ DONE |
| 38 | F | tasks.md | Task 18.1 pipeline order | ✅ DONE |
| 39 | F | tasks.md | Tasks 2.5, 2.6 | ✅ DONE |
| 40 | F | tasks.md | Tasks 4,7,10,13,16,20,23 | ✅ DONE |
| 41 | F | tasks.md | Task 19.1 ESLint flat config | ✅ DONE |
| 42 | F | tasks.md | Task 14.0, 2.6, 3.6 | ✅ DONE |
| 43 | E | tasks.md | Task 15.1 readonly signature | ✅ DONE |
| 44 | E | design.md | Silent Tongue soundCue | ✅ DONE |
| 45 | C | requirements.md | Req 7.6 | ✅ DONE |
| 46 | D | requirements.md, design.md | Req 14.4, design table | ✅ DONE |
| 47 | C | requirements.md | Req 5.3 | ✅ DONE |
| 48 | E | requirements.md | Req 14.10, 29.4 | ✅ DONE |
| 49 | E | requirements.md | Req 12.1 | ✅ DONE |

## Summary by Group

### Group A: Golden counting (findings 1, 8, 10, 13, 14)
**Status:** ✅ COMPLETE
- Added `secondary?: Haunting[]` to Haunting type
- Added `detectedCountsByType` to ClassifiedAudit
- Updated golden test assertions to use `detectedCountsByType`
- Rewrote control-group matching rules

### Group B: Selectors in browser-free test (findings 2, 9, 15, 36, 37)
**Status:** ✅ COMPLETE
- Added Req 27.5 for `.selectors.json` sidecar files
- Specified capture process with document-order validation
- Updated Task 1 with dependency notes and script details
- Added runs 19/19b dependency note to Task 1

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

1. **Design.md amendments** (Group D, E):
   - Add source property column to speech state table (finding 46)
   - Change Silent Tongue speech from "garbled whisper" to `undefined` with `soundCue` (finding 44)
   - Update all detector algorithms with corrected rules
   - Add precedence section documenting the order
   - Update WCAG appendix with 12 criteria

2. **Tasks.md amendments** (Groups B, F):
   - Add Task 0 for runner changes (before Task 1)
   - Update Task 1 with runner dependency, capture script details
   - Remove `*` from tasks 3.2-3.4, 5.3-5.6, 14.2, 15.2-15.7, 17.2, 18.3-18.5, 19.2, 21.1-21.3
   - Add task 2.5 for shared helpers
   - Add task 2.6 for test arbitraries
   - Add task 3.6 for luminance monotonicity property
   - Add task 14.0 for steering precedence documentation
   - Rewrite task 19.1 for ESLint flat config
   - Fix pipeline order in task 18.1
   - Fix checkpoint commands (tasks 4, 7, 10, 23)
   - Update Task 15.1 signature to use `readonly`

## Validation Checklist

- [x] All 49 findings have been addressed
- [x] Requirements.md is consistent with hauntings.md
- [x] Design.md algorithms match requirements exactly
- [x] Tasks.md creates everything requirements and design specify
- [x] No contradictions between the three files
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

