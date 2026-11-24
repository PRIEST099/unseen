# Product-lead consistency check: haunting-classifier spec after run 20

Date: 2026-11-24. Method: 2 finders (design.md, and tasks.md plus REVIEW_RESOLUTION.md) and a skeptical verifier. Each item quotes the stale text and gives the corrected text. Precedence of truth: hauntings.md, then the prompt 20 decisions, then requirements.md. **80 confirmed contradictions.**

## 1. .kiro/specs/haunting-classifier/design.md:60

**Contradiction:** Data Flow inserts an 'Explanation generator' stage between severity and score (lines 60-62), but design line 250 and every detector already fill explanation/persona/fix. Decision F asks for one consistent order: detect -> precedence -> severity -> score. The flow also never computes detectedCountsByType or needsManualCheck.

**Correct text:** RawAudit -> 10 detectors -> UnclassifiedHaunting[] (explanation, persona, fix, speech, speechNote and soundCue already filled) -> resolvePrecedence -> primaries, each with secondary[] -> assignSeverity(primaries, raw) -> computeScore(primaries) -> countsByType (primary only) + detectedCountsByType (primary + secondary, deduplicated per element) -> crossCheckAxe -> needsManualCheck (contrast-uncertain text nodes, plus Tab steps with cdpError or an empty backendDOMNodeId) -> ClassifiedAudit. Delete the 'Explanation generator' box.

## 2. .kiro/specs/haunting-classifier/design.md:101

**Contradiction:** `wcag: WCAGCriterion // primary criterion` and `wcagAlso?: WCAGCriterion[]`. Decision E says: 'Haunting.wcag becomes an array: the full criteria list from the steering.' Even under Req 29.2 (wcag + wcagAlso), no detector pseudo-code fills wcagAlso. Each one leaves the extra criteria as comments (`// also 4.1.2`).

**Correct text:** wcag: WCAGCriterion[] // full criteria list from hauntings.md, primary first; wcag[0] drives the level-A severity rule. guidance?: WCAGCriterion // InvisibleWanderer only: WCAG_2_4_13 (never 2.4.11). Remove wcagAlso, or keep it only if the product lead overrides decision E. Requirements 2.5 and 29.2 must then be aligned to the array as well.

## 3. .kiro/specs/haunting-classifier/design.md:425

**Contradiction:** Every detector sets a single criterion and leaves the rest in comments: NS 425 `wcag: WCAG_4_1_2, // also 2.4.4, 1.1.1`; HP 479; Fog 529; LS 598 `WCAG_2_1_1, // also 4.1.2`; CL 637; IW 687 (no 2.4.13 guidance); WF 773/792 `WCAG_1_3_1, // also 3.3.2, 4.1.2`; ST 826/844; SO 884/903/921 `// also 2.4.6`; Veiled 957/978 `// also 4.1.2`. This contradicts decision E and Req 2.5/5.6/7.5/8.6/10.5/11.6.

**Correct text:** NS: wcag: [WCAG_4_1_2, ...(role === 'link' ? [WCAG_2_4_4] : []), ...(onlyContentIsImage ? [WCAG_1_1_1] : [])]; HP: [WCAG_1_1_1]; Fog: [WCAG_1_4_3]; LS: [WCAG_2_1_1, WCAG_4_1_2]; CL: [WCAG_2_1_2]; IW: [WCAG_2_4_7] plus guidance: WCAG_2_4_13; WF: [WCAG_1_3_1, WCAG_3_3_2, WCAG_4_1_2]; ST: [WCAG_3_1_1]; SO: [WCAG_1_3_1, WCAG_2_4_6]; Veiled: [WCAG_1_3_1, WCAG_4_1_2].

## 4. .kiro/specs/haunting-classifier/design.md:151

**Contradiction:** `UnclassifiedHaunting = Omit<Haunting, "severity" | "isPrimary">` still carries `secondary?: Haunting[]` (which requires severity). Task 14.1 types the secondaries as `UnclassifiedHaunting[]`. Req 15.5 says each primary SHALL carry `secondary` (not optional).

**Correct text:** export type UnclassifiedHaunting = Omit<Haunting, "severity" | "isPrimary" | "secondary">. Precedence output: UnclassifiedHaunting & { isPrimary: boolean; secondary: UnclassifiedHaunting[] }. On Haunting: secondary: Haunting[] (always present, may be empty).

## 5. .kiro/specs/haunting-classifier/design.md:239

**Contradiction:** The detector input list omits every field that decision D and Req 0 add, and that the corrected rules depend on: domNodes, imgSrcAttributes, PageMetadata.htmlBackendDOMNodeId/bodyBackendDOMNodeId, HeadingRecord.backendDOMNodeId and AxeViolationNode.backendDOMNodeId. The output list on line 250 also omits kind, speechNote, soundCue and guidance.

**Correct text:** Add: `domNodes: Record<backendDOMNodeId, DomNodeInfo>` (tag, parentId, attributes id/class/role/href/src/alt/type/tabindex/aria-hidden/aria-label/placeholder/disabled, outerHTMLSnippet <= 300 chars; covers every referenced element plus ancestors up to body); `imgSrcAttributes`; `pageMetadata.htmlBackendDOMNodeId`, `pageMetadata.bodyBackendDOMNodeId`; `pageMetadata.headings[i].backendDOMNodeId`; `axeViolations[].nodes[].backendDOMNodeId` (axeNodeIds, target kept). Output: type, kind?, wcag[], guidance?, nodeIds, box, speech?, speechNote?, soundCue?, htmlSnippet (from domNodes[id].outerHTMLSnippet), explanation, persona, fix.

## 6. .kiro/specs/haunting-classifier/design.md:266

**Contradiction:** 'Precedence key: ... For Cursed Loop it is trapRegionNodeIds[0] ... Cycle members ... do not take part in precedence. For all other types it is nodeIds[0].' Decision C says: 'group by every node id a haunting covers, not only nodeIds[0].' Step 1 on line 269 repeats the nodeIds[0] grouping.

**Correct text:** Collision rule: two hauntings collide when their nodeIds share ANY backendDOMNodeId. CursedLoop nodeIds = trapRegionNodeIds (the region plus every cycle member), so all of them take part. SilentTongue and ShatteredOrder do not take part and are always primary. Algorithm: (1) stable-sort participating hauntings by precedence order (CL > NS > WF > LS > HP > Veiled > IW > Fog); (2) keep claimed: Map<backendDOMNodeId, primary>; (3) for each h, owners = the primaries that claim any id in h.nodeIds. If there are none, h is primary and claims all of h.nodeIds. Otherwise push h into the secondary[] of its highest-precedence owner; (4) return the primaries only (plus SilentTongue/ShatteredOrder), each with its secondary array.

## 7. .kiro/specs/haunting-classifier/design.md:272

**Contradiction:** Step 4 says 'Return the full set (primary + secondary)'. ClassifiedAudit.hauntings is primary-only, with secondaries nested (design line 130, Req 30.1).

**Correct text:** 4. Return the primary hauntings only. Each primary carries its suppressed hauntings in `secondary` (unscored). Secondaries never appear at the top level of `hauntings`.

## 8. .kiro/specs/haunting-classifier/design.md:274

**Contradiction:** 'page-level hauntings (Silent Tongue, Shattered Order with kind no-h1 or no-main) have `nodeIds: []`'. Decision C says Silent Tongue -> html id, no-main/no-h1 -> body id, heading-skip -> the later heading's id, and 'Never nodeIds: []'.

**Correct text:** Edge case: SilentTongue (nodeIds [htmlBackendDOMNodeId]) and ShatteredOrder (no-h1 and no-main: [bodyBackendDOMNodeId]; heading-skip: [the later heading's backendDOMNodeId]) never take part in precedence and are always primary. No haunting ever has nodeIds: [].

## 9. .kiro/specs/haunting-classifier/design.md:276

**Contradiction:** The note gives the wrong reason: 'because the loop's precedence key is the region, not the cycle members'. If only the region took part, a trapped input's WhisperingField would not collide with the loop and would stay primary. Under decision C it becomes the loop's secondary because the loop covers the member ids.

**Correct text:** Note: a Cursed Loop member that is also a Whispering Field keeps the Whispering Field as a secondary of the loop, because the loop's nodeIds (trapRegionNodeIds: the region plus the cycle members) include that input's id and Cursed Loop outranks Whispering Field. It is still counted in detectedCountsByType.

## 10. .kiro/specs/haunting-classifier/design.md:282

**Contradiction:** 'Wraith - ... AND makes the task impossible for AT users' has no predicate. Decision E and Req 12.1 ask for a per-type 'blocks the task' table. Line 283 'affects >=3 elements of the same type' does not say the count runs per page over primaries after precedence (Req 12.2). Line 290 gives the input as UnclassifiedHaunting[] instead of the precedence output.

**Correct text:** Blocks-the-task table: CursedLoop, NamelessSpirit, WhisperingField, LostSoul = yes. HollowPortrait, TheFog, InvisibleWanderer, TheVeiled, ShatteredOrder, SilentTongue = never Wraith. 1. Wraith iff BLOCKS[h.type] && isCoreTask(h, raw). 2. Restless iff (number of primary hauntings of h.type on this page, after precedence) >= 3, OR h.wcag[0].level === 'A'. 3. Otherwise Banished. Input: the primaries returned by resolvePrecedence, plus raw.

## 11. .kiro/specs/haunting-classifier/design.md:287

**Contradiction:** Core task flow is 'inside a <form> (check DOM ancestor chain via backendDOMNodeId lookup)' OR a button/link whose name has a keyword. Decision E: core task is defined by keywords plus ancestry (inside a form, role=dialog, a checkout or cart region) using domNodes. A Nameless Spirit has an empty name and can never match a keyword, so the steering rule 'A checkout button that is a Nameless Spirit is always Wraith' cannot fire. (Req 12.4 also deviates: it uses AX parentId, checks forms only, and has no dialog or cart region.)

**Correct text:** isCoreTask(h, raw): id = h.nodeIds[0]. Walk id and its ancestors via raw.domNodes[x].parentId up to body. True if any of them has tag 'form'; or tag 'dialog' or role attribute 'dialog'/'alertdialog'; or an id/class containing 'checkout' or 'cart'. Also true if the AX role is button/link and the accessible name contains a keyword (submit, checkout, buy, pay, login, sign in, sign up, search, continue, cart, add to, basket, register, subscribe; case-insensitive). When the name is empty, the keywords are matched against domNodes[id] id/class/aria-label/outerHTMLSnippet instead. So a checkout/cart button that is a Nameless Spirit is always Wraith.

## 12. .kiro/specs/haunting-classifier/design.md:340

**Contradiction:** Speech special cases list only heading and generic, plus 'Empty name + interactive role -> haunting (#1 or #7), but still announce the role'. For #7 the steering says "edit text, blank", not just the role. Decision E says to include every special-case row from the steering verbatim. Line 356-358 names no exported function, but Req 14.9 says announce(node). The note and sound cues have no place in this section.

**Correct text:** Exported `announce(node: AXNode, raw: RawAudit): string` plus `announceNote(node): string | undefined`. Verbatim steering rows: button name="" -> "button"; link name="" -> "link"; checkbox name="" unchecked -> "checkbox, unchecked"; textbox/searchbox/spinbutton/slider/combobox with an empty name -> "<roleLabel>, blank" ("edit text, blank", "search, blank"); placeholder-only name -> "<placeholder text>, edit text" with announceNote = "name disappears when typing" (goes to Haunting.speechNote, never into speech); img/image name="" -> "unlabelled graphic, <filename>" (last path segment of imgSrcAttributes[id], no query or hash) or "unlabelled graphic" when there is no src; heading -> "<name>, heading level N"; generic/none/presentation -> "". Sound effects (Silent Tongue garbled whisper, Cursed Loop chime) go only in Haunting.soundCue, never in speech.

## 13. .kiro/specs/haunting-classifier/design.md:423

**Contradiction:** Pseudo-code calls helpers that no task creates, or that task 2.5 creates under other names: generateId (423, 477, 527, ...), extractSnippet (429...), getExplicitRole (473), generateHollowPortraitSpeech (482), parseColor (517, 709...), findAXNode (580), isInsideInteractive/containsInteractive (585-586), filterOutermost (592), generateSpeech (428), generate<Type>Fix (432...), hasVisibleOutline/BoxShadow/ColorChange/TextDecorationChange. Task 2.5 creates hauntingId, parseCssColor, blend, findBox, axByBackendId, axAncestors, axDescendants. Task 6 creates generateExplanation/generatePersona/generateFix(type, ctx). Decision F: every helper a detector uses must be created by an earlier task.

**Correct text:** Use one name per helper, matching tasks: hauntingId(type, nodeId, kind?) (not generateId); parseCssColor + blend (not parseColor); axByBackendId (not findAXNode); snippet(raw, id) = raw.domNodes[id]?.outerHTMLSnippet ?? `<${raw.domNodes[id]?.tag ?? 'element'}>` (not extractSnippet); the role attribute of raw.domNodes[id] (not getExplicitRole); announce(node, raw) (not generateSpeech or generateHollowPortraitSpeech); generateExplanation/generatePersona/generateFix(type, ctx) (not generate<Type>Fix). Add isNativeInteractive, domAncestors/domDescendants (over domNodes.parentId), filterOutermost, winningNameSource, isCoreTask and the four IW indicator predicates to task 2.5, or to a task before the detector that uses them.

## 14. .kiro/specs/haunting-classifier/design.md:450

**Contradiction:** Exclusion bullets 'aria-hidden="true" (unless sole content of button/link ...)' (450) and 'Inline SVG without explicit role="img" (unless sole content of button/link)' (451) are the old inverted rule. 'Unless' reads as 'flag it when it is sole content'. Decision C, Req 3.4/3.6 and the steering say the sole-content image/SVG is NOT a Hollow Portrait (the parent is the Nameless Spirit). Inline SVG icons inside named controls are never flagged.

**Correct text:** Exclusions: alt=""; role presentation/none; aria-hidden="true" (always skipped: the AX node is ignored); an image or inline SVG that is the sole content of a button/link whose name is empty (not reported; the parent is reported as Nameless Spirit); inline SVG inside an already-named control; inline SVG without an explicit role="img" attribute.

## 15. .kiro/specs/haunting-classifier/design.md:458

**Contradiction:** The Hollow Portrait algorithm has no inline-SVG branch (Req 3.5/3.9) and no sole-content suppression (Req 3.4). It relies on the undefined getExplicitRole. Speech (482, 494) uses an undefined generateHollowPortraitSpeech with 'no query string' only. Req 3.9 says without query or hash, and Req 3.7 says plain "unlabelled graphic" when there is no src.

**Correct text:** for (const node of raw.axNodes) { if (node.ignored) continue; const role = String(node.role.value); if (role !== 'img' && role !== 'image') continue; if (String(node.name.value ?? '').trim() !== '') continue; const id = node.backendDOMNodeId; if (raw.imgAltAttributes[String(id)] === '') continue; const dn = raw.domNodes[id]; if (dn?.tag === 'svg' && dn.role !== 'img') continue; const parent = axParent(raw, node); if (parent && ['button','link'].includes(String(parent.role.value)) && (soleNonIgnoredChild(raw, parent, node) && String(parent.name.value ?? '').trim() === '' || dn?.tag === 'svg' && String(parent.name.value ?? '').trim() !== '')) continue; push({ id: hauntingId('HollowPortrait', id), wcag: [WCAG_1_1_1], speech: announce(node, raw) /* 'unlabelled graphic, logo.png' or 'unlabelled graphic' */, htmlSnippet: snippet(raw, id), ... }) }

## 16. .kiro/specs/haunting-classifier/design.md:512

**Contradiction:** The Fog algorithm lists disabled and decorative text as exclusions (lines 504-505, Req 4.6/4.7, steering note), but the loop never skips them. An implementer copying it flags disabled and decorative text.

**Correct text:** Inside the loop, after the backgroundUncertain check: const id = Number(nodeIdStr); if (isDisabled(raw, id)) continue; // AX 'disabled' property on the node or an ancestor, or the domNodes 'disabled' attribute (aria-disabled is not in DomNodeInfo, so use the AX state). if (isDecorative(raw, id)) continue; // self or an ancestor has role none/presentation, or is an <img alt="">. backgroundUncertain nodes are collected by classify() into needsManualCheck with reason 'contrast-uncertain'.

## 17. .kiro/specs/haunting-classifier/design.md:576

**Contradiction:** `if (["button", "a", "input", "select", "textarea", "summary"].includes(tagLower)) return false` treats every <a> as native and omits [contenteditable]. Decision C and Req 5.3: only <a href> (AX role link) is native, and [contenteditable] counts.

**Correct text:** const isNative = (id: number) => { const tag = raw.domNodes[id]?.tag ?? ''; const ax = axByBackendId(raw, id); return ['button','input','select','textarea','summary'].includes(tag) || (tag === 'a' && ax?.role.value === 'link') || isEditable(ax) /* AX 'editable' property, element focusable */ }; if (isNative(sig.backendDOMNodeId)) return false

## 18. .kiro/specs/haunting-classifier/design.md:581

**Contradiction:** `if (!axNode) return false` is the extra exclusion that decision C says to remove (the steering has no AX-node precondition). It can drop the product-thumb Lost Souls (<img alt="" onclick>).

**Correct text:** const axNode = axByBackendId(raw, sig.backendDOMNodeId); if (axNode && INTERACTIVE_ROLES.has(String(axNode.role.value))) return false; // no AX node = no interactive role, so keep the candidate

## 19. .kiro/specs/haunting-classifier/design.md:585

**Contradiction:** isInsideInteractive, containsInteractive and filterOutermost ('sort by DOM depth, keep only ancestors') are undefined. Req 5.4/5.5/5.7 define them over ancestry. With the AX-node precondition gone, a candidate may have no AX node, so AX parentId alone cannot always supply ancestry.

**Correct text:** Inside/contains: skip the candidate if any ancestor (domAncestors via raw.domNodes[].parentId, or axAncestors when an AX node exists) or any descendant is native interactive (tag button/input/select/textarea/summary, AX role link, or editable). Outermost: after filtering, drop every qualifying candidate that has another qualifying candidate among its ancestors.

## 20. .kiro/specs/haunting-classifier/design.md:626

**Contradiction:** Cursed Loop loops over every cycle, ignores trapDetected, uses `nodeIds: cycle.nodeIds...`, `generateId("CursedLoop", cycle.nodeIds[0])` (a string id), and box/snippet from cycle.nodeIds[0]. Decision C and Req 6.4: at most one, only when trapDetected; nodeIds = trapRegionNodeIds (region first); box/snippet from the region. Line 619 names the wrong data source. No soundCue for the steering's repeating chime (decision E).

**Correct text:** const t = raw.tabWalkResult; if (!t.trapDetected || t.trapRegionNodeIds.length === 0) return []; if (!t.cycles.some(c => !c.escapable && !c.includesAllFocusables)) return []; const nodeIds = t.trapRegionNodeIds.map(Number); const regionId = nodeIds[0]; return [{ id: hauntingId('CursedLoop', regionId), type: 'CursedLoop', wcag: [WCAG_2_1_2], nodeIds, box: findBox(raw.boundingBoxes, regionId), speech: undefined, soundCue: 'chime', htmlSnippet: snippet(raw, regionId), explanation: `Keyboard trap: focus cycles through ${nodeIds.length - 1} elements with no escape.`, ... }]. Data source: tabWalkResult.trapDetected, trapRegionNodeIds and cycles[].escapable/includesAllFocusables.

## 21. .kiro/specs/haunting-classifier/design.md:659

**Contradiction:** The visibility criteria summary drops the measurement basis. (a) '... outline colour contrast >= 3:1' and (b) 'box-shadow changed with contrast >= 3:1' do not say 'against after["adjacent-background-color"]', and (c) does not say the colours are blended over the adjacent background (Req 7.2, decision C).

**Correct text:** (a) outline-style != none AND outline-width >= 1px AND contrastRatio(blend(outlineColor, adj), adj) >= 3; (b) box-shadow differs from before, is not 'none', and some rgb()/rgba() colour in it with alpha > 0 gives contrastRatio(blend(c, adj), adj) >= 3 (best ratio wins); (c) border-color or background-color changed and contrastRatio(blend(before, adj), blend(after, adj)) >= 3; (d) text-decoration changed. adj = parseCssColor(focusSnapshot.after['adjacent-background-color']), the nearest opaque ancestor background, never the element's own background-color. A null colour means that criterion fails.

## 22. .kiro/specs/haunting-classifier/design.md:671

**Contradiction:** `for (const step of raw.tabWalkResult.steps)` has no cdpError check, no empty-id check and no dedupe. Line 683 `parseInt(step.backendDOMNodeId, 10)` gives NaN for ''. Decision C: cdpError or empty backendDOMNodeId -> needsManualCheck, at most one IW per element. ManualCheckNode.backendDOMNodeId (line 141) is `number`, so an empty-id step cannot be recorded.

**Correct text:** const seen = new Set<number>(); for (const step of raw.tabWalkResult.steps) { const id = step.backendDOMNodeId === '' ? NaN : Number(step.backendDOMNodeId); if (step.cdpError || !Number.isFinite(id)) continue; /* classify() adds these steps to needsManualCheck with reason 'focus-style-unavailable' */ if (seen.has(id)) continue; seen.add(id); ... } and ManualCheckNode.backendDOMNodeId: number | null. (Req 7.6 should also name empty-id steps.)

## 23. .kiro/specs/haunting-classifier/design.md:710

**Contradiction:** `const bgColor = parseColor(after["background-color"]) // adjacent background (simplification)`: the stale line that decision C, Req 7.2 and findings 2/16/29 reject. It flags the .add-to-cart-btn and product .btn visibleFocus controls (outline colour equal to the element's own fill).

**Correct text:** const adj = parseCssColor(after['adjacent-background-color']); const oc = parseCssColor(after['outline-color']); if (!adj || !oc) return false; return contrastRatio(blend(oc, adj), adj) >= 3

## 24. .kiro/specs/haunting-classifier/design.md:717

**Contradiction:** hasVisibleBoxShadow is a stub, `return false // placeholder`. Decision C: 'Implement (b) the box-shadow rule fully'.

**Correct text:** function hasVisibleBoxShadow(before, after): boolean { const s = after['box-shadow']; if (!s || s === 'none' || s === before['box-shadow']) return false; const adj = parseCssColor(after['adjacent-background-color']); if (!adj) return false; const ratios = (s.match(/rgba?\([^)]*\)/g) ?? []).map(parseCssColor).filter(c => c !== null && c.a > 0).map(c => contrastRatio(blend(c, adj), adj)); return ratios.length > 0 && Math.max(...ratios) >= 3 }

## 25. .kiro/specs/haunting-classifier/design.md:724

**Contradiction:** hasVisibleColorChange compares the raw before and after colours without blending them over the adjacent background. Req 7.2(c): 'contrast between the before and after colours (blended over the adjacent background) is >= 3:1'.

**Correct text:** const adj = parseCssColor(after['adjacent-background-color']); if (!adj) return false; for (const p of ['background-color', 'border-color']) { if (before[p] === after[p]) continue; const b = parseCssColor(before[p]); const a = parseCssColor(after[p]); if (b && a && contrastRatio(blend(b, adj), blend(a, adj)) >= 3) return true } return false

## 26. .kiro/specs/haunting-classifier/design.md:787

**Contradiction:** `const winningSource = sources.find(s => !s.superseded)` and `winningSource.type === "placeholder"` are the stale rule. CDP lists the empty aria-labelledby/aria-label/label candidates first without `superseded`, and reports a placeholder as type 'attribute' with attribute 'placeholder'. Decision C and Req 8.3 define the winner as the first non-superseded source with a non-empty trimmed value.

**Correct text:** const win = (node.name.sources ?? []).find(s => s.superseded !== true && typeof s.value?.value === 'string' && s.value.value.trim() !== ''); const placeholderOnly = !!win && (win.attribute === 'placeholder' || win.attribute === 'aria-placeholder' || win.type === 'placeholder'); if (placeholderOnly) { ... }. Unit test (task 9.4): sources = [aria-labelledby (no value), aria-label (no value), label (no value), {type:'attribute', attribute:'placeholder', value:{type:'computedString', value:'john@example.com'}}, title (superseded:true)] -> flagged.

## 27. .kiro/specs/haunting-classifier/design.md:795

**Contradiction:** `speech: `${name}, ${ROLE_LABEL_MAP[role]}`, // + UI note`: the placeholder note is left as a comment. Decision E and Req 8.5 require speechNote. Case (a) on line 776 builds its speech inline instead of through announce (Req 14.9).

**Correct text:** speech: announce(node, raw), // "john@example.com, edit text"
speechNote: "name disappears when typing",
wcag: [WCAG_1_3_1, WCAG_3_3_2, WCAG_4_1_2],
and case (a): speech: announce(node, raw) // "edit text, blank" / "search, blank"

## 28. .kiro/specs/haunting-classifier/design.md:824

**Contradiction:** Silent Tongue uses `generateId("SilentTongue", 0)`, `nodeIds: []`, `box: null` in both branches (lines 824-828 and 842-846). Decision C: Silent Tongue -> the html element's node id; never nodeIds: [].

**Correct text:** const htmlId = raw.pageMetadata.htmlBackendDOMNodeId; ... id: hauntingId('SilentTongue', htmlId), nodeIds: [htmlId], box: findBox(raw.boundingBoxes, htmlId) ?? null, htmlSnippet: snippet(raw, htmlId), wcag: [WCAG_3_1_1], speech: undefined, soundCue: 'garbled-whisper' (in both the missing-lang and invalid-lang branches).

## 29. .kiro/specs/haunting-classifier/design.md:881

**Contradiction:** no-h1 uses `generateId("ShatteredOrder", 0, "no-h1")`, `nodeIds: []`, `box: null`. Decision C: no-h1 -> body.

**Correct text:** const bodyId = raw.pageMetadata.bodyBackendDOMNodeId ?? raw.domAxMapping.find(m => m.tagName.toLowerCase() === 'body')!.backendDOMNodeId; ... id: hauntingId('ShatteredOrder', bodyId, 'no-h1'), kind: 'no-h1', nodeIds: [bodyId], box: findBox(raw.boundingBoxes, bodyId) ?? null, wcag: [WCAG_1_3_1, WCAG_2_4_6]

## 30. .kiro/specs/haunting-classifier/design.md:900

**Contradiction:** heading-skip uses `generateId("ShatteredOrder", i, "heading-skip")` (a list index) and `nodeIds: []`, `box: null`. Decision C and Req 10.2: heading-skip -> the later heading's backendDOMNodeId, and id = hash(type, that id, kind).

**Correct text:** const h = headings[i]; hauntings.push({ id: hauntingId('ShatteredOrder', h.backendDOMNodeId, 'heading-skip'), type: 'ShatteredOrder', kind: 'heading-skip', wcag: [WCAG_1_3_1, WCAG_2_4_6], nodeIds: [h.backendDOMNodeId], box: findBox(raw.boundingBoxes, h.backendDOMNodeId) ?? null, htmlSnippet: snippet(raw, h.backendDOMNodeId), ... })

## 31. .kiro/specs/haunting-classifier/design.md:919

**Contradiction:** no-main uses `generateId("ShatteredOrder", 0, "no-main")`, `nodeIds: []`, `box: null`, `htmlSnippet: ""`. Decision C and Req 10.3: no-main -> body.

**Correct text:** id: hauntingId('ShatteredOrder', bodyId, 'no-main'), kind: 'no-main', nodeIds: [bodyId], box: findBox(raw.boundingBoxes, bodyId) ?? null, htmlSnippet: snippet(raw, bodyId), wcag: [WCAG_1_3_1, WCAG_2_4_6]

## 32. .kiro/specs/haunting-classifier/design.md:953

**Contradiction:** Veiled case (a), `if (mapping.ariaHidden && mapping.isFocusable)`, reports every focusable row. ariaHidden is inherited, so each descendant gets its own haunting (.promo-strip gives 3 against golden 1). Decision C: one haunting per hidden subtree root.

**Correct text:** Remove the per-row case (a) block. Focusable descendants of a hidden root are folded into that root's single haunting: nodeIds = [rootId, ...focusable descendant ids]. Cases (a) and (b) on the same root produce one haunting.

## 33. .kiro/specs/haunting-classifier/design.md:970

**Contradiction:** Veiled case (b), `if (!mapping.hasAxNode && (mapping.hasVisibleText || mapping.containsFocusable))`, does not require exclusion via aria-hidden or role presentation/none, and ignores isFocusable. The decorative-skip on line 972 is dead code. Decision C and Req 11.1/11.2 require (ariaHidden || isPresentational) on a subtree root.

**Correct text:** for (const m of raw.domAxMapping) { if (!(m.ariaHidden || m.isPresentational) || m.hasAxNode) continue; const reasons = axByBackendId(raw, m.backendDOMNodeId)?.ignoredReasons ?? []; if (!reasons.some(r => r.name === 'ariaHiddenElement' || r.name === 'presentationalRole')) continue; /* root only, not ariaHiddenSubtree */ if (domAncestors(raw, m.backendDOMNodeId).some(a => reportedRoots.has(a))) continue; if (!(m.hasVisibleText || m.containsFocusable || m.isFocusable)) continue; /* decorative */ const focusDesc = raw.domAxMapping.filter(d => d.isFocusable && d.backendDOMNodeId !== m.backendDOMNodeId && domAncestors(raw, d.backendDOMNodeId).includes(m.backendDOMNodeId)).map(d => d.backendDOMNodeId); reportedRoots.add(m.backendDOMNodeId); push({ id: hauntingId('TheVeiled', m.backendDOMNodeId), nodeIds: [m.backendDOMNodeId, ...focusDesc], wcag: [WCAG_1_3_1, WCAG_4_1_2], speech: undefined, fix: generateFix('TheVeiled', { focusable: m.isFocusable || m.containsFocusable }), ... }) }

## 34. .kiro/specs/haunting-classifier/design.md:1002

**Contradiction:** 'Invalid input -> ... an error note in automatedCoverageNote'. Req 17.3 fixes automatedCoverageNote to an exact sentence.

**Correct text:** Invalid input -> an empty ClassifiedAudit with score 0. automatedCoverageNote is always exactly "Automated checks find approximately 30-40% of WCAG issues. Manual testing is required for complete coverage."

## 35. .kiro/specs/haunting-classifier/design.md:1046

**Contradiction:** The golden test is still 'Integration Tests (Playwright Test)' in tests/classify.int.spec.ts, run by `npm run test:integration`. It asserts `countsByType` and says only 'node IDs (resolved from selectors) match'. Decision A: assert detectedCountsByType, the per-type node-id union, and controls by guarded type. Decision B: browser-free, reads only JSON. Req 10.6/20.4/20.6 add the page-level, kinds and cursedLoopMatch rules.

**Correct text:** Golden test (Vitest, no browser): packages/core/src/classifier/golden.test.ts, run with `npx vitest --run` in packages/core. For each page it reads only tests/fixtures/raw/<page>.json, <page>.selectors.json and apps/cursed-shop/expected-hauntings.json. classify(raw), then assert: (1) detectedCountsByType[type] === golden count for every type; (2) for element-level types, the union of nodeIds[0] over primary and secondary instances equals the union of the selectors' `self` ids; CursedLoop matches when every id in its nodeIds is in the selector's `subtree` set; SilentTongue and ShatteredOrder no-h1/no-main match by type + kind + count, and the ShatteredOrder kinds multiset equals `kinds`; (3) controls: no `self` id of a control selector appears in any primary or secondary of its guarded types (cookieBanner->CursedLoop; decorativeImages->HollowPortrait; accessibleCardLinks->LostSoul,NamelessSpirit; namedQuickView->NamelessSpirit; visibleFocus->InvisibleWanderer; decorativeIcons->HollowPortrait,TheVeiled; namedSocialLinks->NamelessSpirit; hasMain->ShatteredOrder(no-main); hasH1->ShatteredOrder(no-h1); hasLang->SilentTongue; decorativeAltNotHollow->HollowPortrait; namedField->WhisperingField; properLabels->WhisperingField; visibleFocusInTrap->InvisibleWanderer; mouseOnlyNativeExits->LostSoul).

## 36. .kiro/specs/haunting-classifier/design.md:1066

**Contradiction:** Fixture capture process: 'Start apps/cursed-shop with npm start (serves on http://localhost:3000)', 'npm run capture-fixtures', script `tests/fixtures/capture.ts`. It writes no selectors sidecar and states no dependency on task 0 or runs 19/19b. All of this contradicts decision B (and the shop actually serves on 4173).

**Correct text:** Process: runs only after task 0 and audit-engine runs 19 and 19b have landed. `npm run capture:fixtures -w @the-unseen/core` runs packages/core/tests/fixtures/capture.mjs. It starts the shop the way tests/fixtures/shop-server.ts does (127.0.0.1, random port, closable; re-implemented in .mjs, because a .mjs cannot import the .ts file without tsx), never `npm start`. For each page it writes raw/<page>.json and raw/<page>.selectors.json. Commit both.

## 37. .kiro/specs/haunting-classifier/design.md:1075

**Contradiction:** The capture script is TypeScript run by tsx, uses `__dirname` in an ESM package and BASE localhost:3000, never sets the Chromium channel, calls auditUrl (which closes the page, so selectors cannot be resolved in the same session), writes unsorted JSON with the screenshot, never closes the pool or server, and `.catch(console.error)` exits 0. All of this contradicts decision B and Req 27.4/27.5.

**Correct text:** capture.mjs (ESM): const RAW = fileURLToPath(new URL('./raw/', import.meta.url)). Launch Chromium with channel: process.env.UNSEEN_CHROMIUM_CHANNEL || undefined, allowPrivate: true. For each page, in the SAME page session that produced the RawAudit: collect the RawAudit, then resolve every golden selector (hauntings and controls) through CDP DOM.getDocument({depth:-1}) + DOM.querySelectorAll + DOM.describeNode to {self:number[], subtree:number[]}. Fail if querySelectorAll('*').length !== raw.boundingBoxes.length. auditUrl cannot be used here because it closes its context before returning. If the runner must export a page-level collector for this, that export belongs in task 0, the only runner change. Assert collectionErrors.length === 0 and endReason (index 'body', product 'body', checkout 'trap'). Write JSON with recursively sorted keys and screenshotPng: ''. In finally: await getPool().close(); await shop.close(). On error: process.exitCode = 1.

## 38. .kiro/specs/haunting-classifier/design.md:1097

**Contradiction:** 'Regeneration: Re-run when apps/cursed-shop HTML changes or new haunting types are added' leaves out runner changes, which also change the fixtures (decision B dependency on runs 19/19b).

**Correct text:** Regeneration: re-capture whenever apps/cursed-shop/*.html, packages/core/src/runner/** or packages/core/src/types.ts changes, then re-run the golden test.

## 39. .kiro/specs/haunting-classifier/design.md:1128

**Contradiction:** The ESLint rule is a legacy `.eslintrc`-style `overrides` JSON. ESLint 9 ignores it and it has no TypeScript parser. Decision F: eslint@9 + typescript-eslint, flat eslint.config.js, npm run lint.

**Correct text:** Root eslint.config.js: import tseslint from 'typescript-eslint'; export default tseslint.config({ files: ['packages/core/src/classifier/**/*.ts'], languageOptions: { parser: tseslint.parser }, rules: { 'no-restricted-imports': ['error', { patterns: [{ group: ['**/runner/*', '../runner/*', './runner/*'], message: 'classifier must not import runner (structure.md)' }] }] } }). Root devDependencies eslint@^9 and typescript-eslint@^8; root script "lint": "eslint packages/core/src/classifier". Keep the grep boundary test as well.

## 40. .kiro/specs/haunting-classifier/design.md:1149

**Contradiction:** The Test Commands block invents scripts (test, test:watch, test:integration, "capture-fixtures": "tsx tests/fixtures/capture.ts"). Decision F says to use the existing npm scripts and not invent any. Decision B fixes the capture script as `capture:fixtures` on an .mjs without tsx.

**Correct text:** Use the existing packages/core scripts: `npm run typecheck`, `npx vitest --run`, `npx playwright test` (run in packages/core). Add only "capture:fixtures": "node tests/fixtures/capture.mjs" to packages/core/package.json, and "lint" to the root package.json.

## 41. .kiro/specs/haunting-classifier/design.md:1216

**Contradiction:** Correctness Properties has no property for Req 23.5 (luminance monotonicity), although decision F requires a task for it and task 3.6 tests it without a property number.

**Correct text:** Add 'Property 19: Luminance monotonicity. For any colour c and any channel, increasing that channel never decreases relativeLuminance(c). For a fixed darker colour, contrastRatio is non-decreasing as the lighter colour's luminance increases. Validates: Requirements 23.5.' Reference Property 19 from task 3.6.

## 42. .kiro/specs/haunting-classifier/design.md:1222

**Contradiction:** Speech property traceability is shifted: P10 (role) says 25.3, P11 (name) says 25.2, P12 (no fabricated text) says 25.3, P13 (generic) says 25.4. In requirements, 25.2 = role, 25.3 = name iff non-empty, 25.4 = no undefined/null/fabricated. Tasks 5.3-5.6 copy the same wrong refs.

**Correct text:** P10 Validates 14.3, 25.2; P11 Validates 14.2, 25.3; P12 Validates 14.8, 25.4; P13 Validates 14.5 (and the generic exception in 25.2).

## 43. .kiro/specs/haunting-classifier/design.md:1232

**Contradiction:** Property 12 says the announcement contains 'only the name, role, and state'. Req 14.10 exempts the steering special rows (", blank", "unlabelled graphic[, filename]"). Without that exemption the property fails on correct output.

**Correct text:** Property 12: for any AX node, the announcement never contains 'undefined', 'null', element ids or HTML. Apart from the steering special rows ("<roleLabel>, blank", "unlabelled graphic", "unlabelled graphic, <filename>"), it contains only name, role and state. speechNote and soundCue text never appear in speech.

## 44. .kiro/specs/haunting-classifier/design.md:1262

**Contradiction:** Property 17, 'each element has at most one primary haunting (by backendDOMNodeId)', does not match the decision-C grouping (by every id in nodeIds) and is broken by the decision's own page-level ids. no-h1 and no-main both sit on body, and both are always primary.

**Correct text:** Property 17: for any classified audit, no backendDOMNodeId appears in the nodeIds of two primary hauntings that take part in precedence. SilentTongue and ShatteredOrder are excluded: they are always primary and may share html/body.

## 45. .kiro/specs/haunting-classifier/tasks.md:658

**Contradiction:** The Task Dependency Graph starts at task 1 and never schedules task 0, 2.5, 2.6, 3.6 or 14.0. A scheduler following the waves skips the runner prerequisite, the shared helpers, the arbitraries, the luminance property and the steering precedence section. That contradicts decision D (task 0 first) and decision F (helpers created before the detectors that use them).

**Correct text:** Waves must start with ['0'], then ['1'], then ['2.1','2.2','2.3'], then ['2.4','2.5','2.6'], so that 2.5 and 2.6 come before any 3.x/8.x/11.x task. Put 3.6 with ['3.2','3.3','3.4','3.5'], and ['14.0'] before ['14.1']. Renumber the wave ids.

## 46. .kiro/specs/haunting-classifier/tasks.md:11

**Contradiction:** Task 0 omits decision D's coverage rule and field details: domNodes must cover every element referenced by any other RawAudit field plus ancestors up to body; the 12 attributes; outerHTMLSnippet <= 300; keep axe `target` and add axeNodeIds. Its test only checks 'populated correctly'. If the capture script needs a page-level collector export, that export also belongs here (the only runner change).

**Correct text:** Add RawAudit.domNodes: Record<backendDOMNodeId, DomNodeInfo { tag, parentId, id, class, role, href, src, alt, type, tabindex, aria-hidden, aria-label, placeholder, disabled, outerHTMLSnippet (<= 300 chars) }>, covering every element referenced by axNodes, eventListenerSignals, tabWalkResult (steps, trapRegionNodeIds), textNodeStyles, imgAltAttributes, domAxMapping, headings, axe nodes and html/body, plus all their ancestors up to body. Keep AxeViolationNode.target and add backendDOMNodeId (axeNodeIds) resolved at collection time. Integration test: every referenced id is in domNodes and its parentId chain reaches body.

## 47. .kiro/specs/haunting-classifier/tasks.md:27

**Contradiction:** Task 1: 'For each page, call auditUrl then resolve selectors ... while page is open'. This is impossible, because auditUrl closes the context first. Line 32: `node --experimental-strip-types tests/fixtures/capture.mjs` 'or add tsx to devDependencies'; decision B says no tsx (and strip-types does nothing for an .mjs). The task never mentions UNSEEN_CHROMIUM_CHANNEL or names the <page>.selectors.json output, and line 24 says 'no tsx initially'.

**Correct text:** For each page, collect the RawAudit and resolve every golden selector (hauntings and controls) to {self, subtree} backendDOMNodeIds in the same page session (not via auditUrl, which closes its context; any runner export this needs goes in task 0). Launch Chromium with process.env.UNSEEN_CHROMIUM_CHANNEL. Write tests/fixtures/raw/<page>.json and tests/fixtures/raw/<page>.selectors.json. Script: "capture:fixtures": "node tests/fixtures/capture.mjs" in packages/core (no tsx, ever), run with `npm run capture:fixtures -w @the-unseen/core`.

## 48. .kiro/specs/haunting-classifier/tasks.md:137

**Contradiction:** Task 5.2 implements `generateSpeech(axNode: AXNode): string`. Req 14.9 and decision E: exported `announce(node)`, with the steering special rows verbatim and the placeholder note (speechNote). Tests 5.7 never check "edit text, blank", "unlabelled graphic, <filename>" or the note. Task 8.1 line 211 also says 'Use generateSpeech'.

**Correct text:** 5.2 Implement `announce(node: AXNode, raw: RawAudit): string` and `announceNote(node): string | undefined`, including the steering special rows. 5.7 add tests: textbox name="" -> "edit text, blank"; searchbox name="" -> "search, blank"; placeholder-only -> "Email address, edit text" with note "name disappears when typing"; img name="" src="/img/logo.png?v=2#x" -> "unlabelled graphic, logo.png"; img with no src -> "unlabelled graphic"; radio with checked='true' -> "<name>, radio button, selected". 5.5 exempts these rows. 8.1/8.3/9.3: detectors call announce.

## 49. .kiro/specs/haunting-classifier/tasks.md:65

**Contradiction:** Task 2.5 creates hauntingId, parseCssColor, blend, findBox, axByBackendId, axAncestors and axDescendants. The design detectors call different or extra helpers (generateId, parseColor, findAXNode, extractSnippet, getExplicitRole, isInsideInteractive, containsInteractive, filterOutermost, IW predicates, the winning-source helper, isCoreTask), and task 6 creates generateFix(type, ctx) while the design calls generate<Type>Fix. Decision F: every helper must come from an earlier task.

**Correct text:** Task 2.5 also creates: snippet(raw, id) (domNodes outerHTMLSnippet with a tag fallback), domAncestors/domDescendants over domNodes.parentId, isNativeInteractive, filterOutermost, fileNameFromSrc (last path segment, no query or hash), winningNameSource, isCoreTask (or place isCoreTask in 12.1 before it is used), and the IW predicates hasVisibleOutline/BoxShadow/ColorChange/TextDecorationChange (or create them in 11.5). The design must use exactly these names.

## 50. .kiro/specs/haunting-classifier/tasks.md:119

**Contradiction:** Task 3.6 is titled 'relativeLuminance is non-decreasing in each channel', but its only check is 'Verify contrastRatio grows with |L1-L2|'. Req 23.5 requires both.

**Correct text:** Verify (1) raising any single channel never lowers relativeLuminance, and (2) for a fixed darker colour, contrastRatio is non-decreasing as the lighter colour's luminance increases (Property 19).

## 51. .kiro/specs/haunting-classifier/tasks.md:225

**Contradiction:** Task 8.3, 'Skip alt="", role=presentation/none, aria-hidden (with exceptions)', keeps the inverted rule. Decision C: aria-hidden images are always skipped, and sole-content images/SVGs of a button/link are never Hollow Portraits. The SVG role="img" rule and Req 3.9 are not referenced.

**Correct text:** Skip alt="", role presentation/none and aria-hidden images (always). Never report an image or SVG that is the sole content of an unnamed button/link (the parent is the Nameless Spirit), or an SVG inside a named control. Flag svg only with an explicit role="img" (domNodes role attribute). _Requirements: 3.1-3.9_. 8.4 add tests: aria-hidden <img> as sole content of a <button> -> no HollowPortrait; <a href><svg></svg></a> -> no HollowPortrait.

## 52. .kiro/specs/haunting-classifier/tasks.md:244

**Contradiction:** Task 8.5: 'Return page-level haunting (nodeIds: [], box: null)'. Decision C: Silent Tongue uses the html element's node id; never nodeIds: [].

**Correct text:** Return one haunting with nodeIds: [raw.pageMetadata.htmlBackendDOMNodeId], id = hauntingId('SilentTongue', htmlId), speech undefined, soundCue 'garbled-whisper'. 8.6 asserts nodeIds equals [htmlBackendDOMNodeId].

## 53. .kiro/specs/haunting-classifier/tasks.md:278

**Contradiction:** Task 9.3, 'Use name.sources to determine winning source', does not state the decision-C rule. Task 9.4 lacks the required realistic-CDP-sources unit test and any speechNote check.

**Correct text:** 9.3: winning source = first name.sources entry with superseded !== true and a non-empty trimmed value.value. It is placeholder when attribute is 'placeholder'/'aria-placeholder' or type is 'placeholder'. Set speechNote 'name disappears when typing'. 9.4 add: sources [aria-labelledby (no value), aria-label (no value), label (no value), placeholder attribute (value 'john@example.com'), title (superseded)] -> flagged, with speech "john@example.com, edit text" and that speechNote.

## 54. .kiro/specs/haunting-classifier/tasks.md:293

**Contradiction:** Tasks 9.5/9.6 never set node ids for no-h1/no-main (body) or heading-skip (the later heading). The requirement refs omit 10.6, and the tests do not check node ids, which decision C requires.

**Correct text:** no-h1 and no-main: nodeIds [bodyBackendDOMNodeId]; heading-skip: nodeIds [headings[i].backendDOMNodeId] (the later heading), id = hauntingId(type, that id, kind). _Requirements: 10.1-10.6_. 9.6: assert these nodeIds, and that h1 -> h3 gives a heading-skip on the h3's id.

## 55. .kiro/specs/haunting-classifier/tasks.md:318

**Contradiction:** Task 11.1, 'Verify not native interactive element', does not encode decision C: only <a href> (AX role link) is native, [contenteditable] counts, and candidates without an AX node are kept. The requirement list omits 5.7. Task 11.2 has no test for an href-less <a>.

**Correct text:** Native = button, input, select, textarea, summary, <a> with AX role link, or an editable element. An <a> without href is not native. Do not skip candidates that have no AX node. Compute inside/contains/outermost over ancestry (Req 5.7). _Requirements: 5.1-5.7_. 11.2 add: <a onclick> without href and not in the Tab walk -> LostSoul; an element with a click listener and no AX node -> LostSoul.

## 56. .kiro/specs/haunting-classifier/tasks.md:334

**Contradiction:** Task 11.3, 'Use tabWalkResult.cycles from RawAudit', contradicts decision C and Req 6.4: the haunting comes from trapDetected, and its nodeIds = trapRegionNodeIds (region first).

**Correct text:** Emit at most one CursedLoop, only when tabWalkResult.trapDetected and a cycle with escapable === false and no includesAllFocusables exists. nodeIds = trapRegionNodeIds.map(Number) (region first); id/box/snippet from the region; soundCue 'chime'. 11.4 asserts nodeIds[0] is the region.

## 57. .kiro/specs/haunting-classifier/tasks.md:349

**Contradiction:** Task 11.5 never mentions the adjacent background, the full box-shadow rule, cdpError or empty-id steps going to needsManualCheck, or one-per-element dedupe. The requirement list stops at 7.5 (omits 7.6). Task 11.6 lacks the outline-equals-own-fill test.

**Correct text:** Measure every indicator against after['adjacent-background-color'] (blended); implement box-shadow (b) fully; skip cdpError and empty-id steps (classify adds them to needsManualCheck as 'focus-style-unavailable'); evaluate each id once. _Requirements: 7.1-7.6_. 11.6 add: an outline colour equal to the element's own background but >= 3:1 against the adjacent background -> not flagged; a cdpError step -> no haunting; a node visited twice -> one haunting.

## 58. .kiro/specs/haunting-classifier/tasks.md:365

**Contradiction:** Task 11.7 keeps the per-row case (a)/(b) split ('Check for focusable inside aria-hidden', 'visible content excluded from AX tree'). Decision C: case (b) requires aria-hidden or role presentation/none, with one haunting per hidden subtree root. The requirement list omits 11.7.

**Correct text:** Report one haunting per hidden subtree root (ariaHidden || isPresentational, with AX ignoredReasons ariaHiddenElement/presentationalRole) that has visible text or focusable content. nodeIds = [root, ...focusable descendants]. Rows without ariaHidden || isPresentational never qualify. _Requirements: 11.1-11.7_. 11.8 add: <div aria-hidden=true><p>text</p><a href>...</a></div> -> exactly 1 haunting with nodeIds [div, a].

## 59. .kiro/specs/haunting-classifier/tasks.md:382

**Contradiction:** Task 12.1, `assignSeverity(hauntings: UnclassifiedHaunting[], raw)`, does not take the precedence output. 'Wraith (core task flow + blocks task)' has no blocking table, the >=3 count has no scope, and core task flow is only 'inside form OR keywords'. Decision E: deterministic, with a blocking table and domNodes ancestry (form, role=dialog, checkout/cart region). Test 12.2 'checkout button with Nameless Spirit gets Wraith' cannot pass on keywords alone, because the name is empty.

**Correct text:** assignSeverity(primaries: Array<UnclassifiedHaunting & { isPrimary: true; secondary: UnclassifiedHaunting[] }>, raw): Haunting[]. Wraith iff type in {CursedLoop, NamelessSpirit, WhisperingField, LostSoul} AND isCoreTask (domNodes ancestry: form, dialog/alertdialog, checkout/cart id or class; or a keyword in the AX name, or in the id/class/aria-label/snippet when the name is empty). Restless iff >= 3 primaries of the same type on the page, or wcag[0].level === 'A'. Otherwise Banished. 12.2 add: an unnamed button inside <form>, and an unnamed button with class 'checkout-btn', are both Wraith.

## 60. .kiro/specs/haunting-classifier/tasks.md:406

**Contradiction:** Task 14.0 tells Kiro to document 'keying on nodeIds[0] (trapRegionNodeIds[0] for Cursed Loop)' in the steering. Decision C: group by every node id a haunting covers.

**Correct text:** Explain that precedence groups hauntings by every backendDOMNodeId in nodeIds (Cursed Loop nodeIds = trapRegionNodeIds: the region plus the cycle members). A lower-precedence haunting that shares any id becomes a secondary of the higher one (e.g. a trapped Whispering Field input is a secondary of the Cursed Loop). Secondaries are unscored but counted in detectedCountsByType. SilentTongue and ShatteredOrder never take part.

## 61. .kiro/specs/haunting-classifier/tasks.md:415

**Contradiction:** Task 14.1, 'Group hauntings by precedence key (nodeIds[0] for most, trapRegionNodeIds[0] for Cursed Loop)' and 'Page-level hauntings (nodeIds: []) are always primary'; task 14.2, 'each precedence key has at most one primary'. Both contradict decision C (every node id; never nodeIds: []). Task 14.3 lacks the CursedLoop-member/WhisperingField case.

**Correct text:** 14.1: collisions are on any shared backendDOMNodeId in nodeIds; process in precedence order; the first claimant is primary and later colliders go into its secondary[]; SilentTongue and ShatteredOrder (html/body/heading ids) are excluded and always primary. 14.2: no backendDOMNodeId appears in two participating primaries. 14.3 add: a CursedLoop whose trapRegionNodeIds include a WhisperingField input -> the WF is in loop.secondary, and detectedCountsByType.WhisperingField still counts it.

## 62. .kiro/specs/haunting-classifier/tasks.md:501

**Contradiction:** Task 17.1, 'Map each haunting to axe violations by backendDOMNodeId', omits Req 16.1's rule->type fallback for null-id axe nodes, and the note that ShatteredOrder has no axe rule.

**Correct text:** Match where AxeViolationNode.backendDOMNodeId is in haunting.nodeIds. Nodes with a null id are matched by the Req 16.1 rule->type table (button-name/link-name->NamelessSpirit; image-alt/svg-img-alt/role-img-alt->HollowPortrait; color-contrast->TheFog; label->WhisperingField; html-has-lang/html-lang-valid->SilentTongue; aria-hidden-focus->TheVeiled; scrollable-region-focusable/nested-interactive->none). Anything else goes to unmapped.

## 63. .kiro/specs/haunting-classifier/tasks.md:524

**Contradiction:** Task 18.1 never computes countsByType (primary) or detectedCountsByType (primary + secondary, deduplicated per element), which decision A requires. Its needsManualCheck step does not cover empty-id Tab steps.

**Correct text:** After assignSeverity: countsByType = per-type count of primaries. detectedCountsByType = per-type count of distinct elements (nodeIds[0]) across primaries and all secondary arrays. needsManualCheck = backgroundUncertain text nodes ('contrast-uncertain') plus Tab steps with cdpError or an empty backendDOMNodeId ('focus-style-unavailable').

## 64. .kiro/specs/haunting-classifier/tasks.md:589

**Contradiction:** Tasks 21.1-21.3 say only 'Assert node IDs ... match'. They never state the per-type union of primary and secondary ids, the controls-by-guarded-type rule, the page-level by-kind match, the kinds multiset or the cursedLoopMatch subtree rule (decision A, Req 10.6/20.4/20.6). They give no browser-free Vitest location and no re-capture-before-golden step (decision B: capture after runs 19/19b).

**Correct text:** In packages/core/src/classifier/golden.test.ts (Vitest, reads JSON only), per page: detectedCountsByType equals the golden counts. The per-type union of nodeIds[0] over primary and secondary equals the union of the `self` ids of the golden selectors. CursedLoop: every nodeId is in the selector's subtree. SilentTongue and no-h1/no-main: type + kind + count; the ShatteredOrder kinds multiset equals `kinds`. Controls: no control `self` id appears in a primary or secondary of its guarded types (Req 20.4 table). _Requirements: 20.1-20.6, 10.6_. Before task 21, re-run task 1 if runner/** or shop HTML changed.

## 65. .kiro/specs/haunting-classifier/requirements.md:233

**Contradiction:** Req 15.1 contradicts itself and decision C: 'match the same element (by any backendDOMNodeId in the haunting's nodeIds)', but then 'The precedence key ... For Cursed Loop it is the trap region node ... Cycle members ... do not take part in precedence ... For all other types it is nodeIds[0]'. Design and tasks copied the nodeIds[0] half.

**Correct text:** Two hauntings collide when their nodeIds share any backendDOMNodeId (CursedLoop nodeIds = trapRegionNodeIds, the region plus the cycle members). Each backendDOMNodeId belongs to at most one participating primary. SilentTongue and ShatteredOrder never take part.

## 66. .kiro/specs/haunting-classifier/requirements.md:192

**Contradiction:** Req 12.4 defines 'inside a <form>' via AX parentId to a domAxMapping row and has no role=dialog or checkout/cart region. Decision E says ancestry comes from domNodes and includes form, role=dialog and checkout/cart regions. The design should follow the decision.

**Correct text:** Core task flow element: the element or a domNodes ancestor (via parentId up to body) is a <form>, a dialog (tag dialog or role dialog/alertdialog), or has an id/class containing 'checkout'/'cart'; OR its AX role is button/link and the keyword list matches its accessible name (or its id/class/aria-label/snippet when the name is empty).

## 67. .kiro/specs/haunting-classifier/requirements.md:75

**Contradiction:** Req 3.9 reads the svg role from 'RawAudit.explicitRoles (runner prerequisite task)'. Req 0 and task 0 never add explicitRoles; decision D's domNodes already carries the role attribute. The design's getExplicitRole therefore has no source.

**Correct text:** For tagName === 'svg', flag only if raw.domNodes[id] has role attribute 'img'. (No separate explicitRoles field.)

## 68. .kiro/specs/haunting-classifier/REVIEW_RESOLUTION.md:142

**Contradiction:** The validation checklist ticks 'Design.md algorithms match requirements exactly' and 'No contradictions between the three files'. Its own Next Steps (lines 118-123) still list the design.md detector rewrites as pending, and design.md still has the stale IW, WF, Veiled, Cursed Loop, Lost Soul, Hollow Portrait, page-level nodeIds, precedence, fixture-capture and ESLint pseudo-code. The table also marks 2, 3, 4, 5, 6, 7, 16, 21, 24 and 29-31 as DONE with only requirements.md changed.

**Correct text:** Uncheck those two items, and mark the findings whose design.md/tasks.md fix is still pending (2, 3, 4, 5, 6, 7, 9, 11, 12, 15, 16, 17, 18, 19, 21, 22, 23, 24, 25, 26, 27, 29, 30, 31, 32, 34, 35, 36, 41, 45, 47, 48, 49) as PARTIAL until design.md and tasks.md are rewritten.

## 69. .kiro/specs/haunting-classifier/tasks.md:9

**Contradiction:** Task 0 is incomplete against decision D and Req 0. Line 11 says only "with tag, parentId, attributes, outerHTMLSnippet". It does not list the 12 required attributes or the coverage rule ("every element referenced by any other RawAudit field, plus their ancestors up to body"). Line 10 names only collectors.ts and types.ts, but axe node-id resolution belongs in runner/axe.ts and assembly is in src/audit.ts. Line 15 adds `AxeViolationNode.backendDOMNodeId` without saying to keep `target`, while Req 0.7 calls the same thing `axeNodeIds`, so it has two names. Req 3.9 needs `RawAudit.explicitRoles` ("runner prerequisite task") and Req 11.7 may need `isHiddenRoot`, but no task creates either. Nothing gives fixture capture a way to resolve selectors while the page is still open: auditUrl closes the context in runAudit's finally, and AuditHooks has only onPageCreated. The new id-bearing fields will also break tests/determinism.int.spec.ts normalise(), which re-keys only the fields it knows about. The test at line 18 is a single vague bullet.

**Correct text:** - [ ] 0. Extend RawAudit (runner prerequisite; the only runner change in this spec)
  - Files: `packages/core/src/types.ts`, `src/runner/collectors.ts` (domNodes, headings, html/body ids, imgSrcAttributes), `src/runner/axe.ts` (axe node ids), `src/audit.ts` (assemble + capture hook).
  - Add `RawAudit.domNodes: Record<string /* backendDOMNodeId */, DomNodeInfo>`, where `DomNodeInfo = { tag: string; parentId: number | null; attrs: { id?; class?; role?; href?; src?; alt?; type?; tabindex?; 'aria-hidden'?; 'aria-label'?; placeholder?; disabled? }; outerHTMLSnippet: string /* <= 300 chars */ }`. Coverage: every backendDOMNodeId referenced by any other RawAudit field (boundingBoxes, axNodes, textNodeStyles, elementCursorStyles, imgAltAttributes, imgSrcAttributes, eventListenerSignals, tabWalkResult steps/cycles/trapRegionNodeIds, domAxMapping, pageMetadata ids, axe node ids), plus every ancestor up to and including `body`, plus `html`.
  - Add `imgSrcAttributes`, `HeadingRecord.backendDOMNodeId` (from headingIds), `PageMetadata.htmlBackendDOMNodeId` and `bodyBackendDOMNodeId`.
  - AxeViolationNode: keep `target` and add `backendDOMNodeId: number | null`. This is the single `axeNodeIds` field; resolve it in the same page session at collection time. Resolve a single-string target with querySelector(target[0]) then DOM.describeNode; a multi-part (iframe or shadow) target gets null.
  - Radio and menuitemradio state: keep the CDP `checked` property in axNodes (assert it).
  - In audit.ts add `AuditHooks.beforeClose?: (page: Page, raw: RawAudit) => Promise<void>` to auditUrlWithHooks, awaited after assemble() and before the context closes (fixture capture uses it).
  - No `explicitRoles` or `isHiddenRoot` field: the classifier reads `domNodes[id].attrs.role` and `attrs['aria-hidden']` (amend Req 3.9 and 11.7).
  - Update `tests/determinism.int.spec.ts` normalise() to canonicalise the new ids: domNodes keys and parentId, imgSrcAttributes keys, headings[].backendDOMNodeId, pageMetadata html/body ids, and axe nodes[].backendDOMNodeId.
  - Tests: new `packages/core/tests/raw-audit-dom-nodes.int.spec.ts` (Playwright) on the three Cursed Shop pages. Assert that every id referenced anywhere in RawAudit has a domNodes entry, that following parentId from any entry reaches body, that outerHTMLSnippet.length <= 300, that heading ids map to h1-h6 tags, that htmlBackendDOMNodeId maps to tag 'html', that every axe node with a single-string target has a non-null id, and that a checked radio has `checked: 'true'`.
  - Checkpoint: `npm run typecheck -w @the-unseen/core`, then `npx playwright test` in packages/core.
  - MUST be complete before Task 1.

## 70. .kiro/specs/haunting-classifier/tasks.md:27

**Contradiction:** Task 1 says "For each page, call `auditUrl` then resolve selectors to `{self, subtree}` while page is open". auditUrl closes its context before it returns (audit.ts runAudit finally → closeContext), so the page is no longer open. Decision B needs the same page session, and no task provides a mechanism. Line 25, "Use `startShopServer()` ... with `{ allowPrivate: true }`", is also wrong: startShopServer() takes no arguments, and allowPrivate is an auditUrl option. Line 29, "correct `endReason`", is never defined. The task leaves out UNSEEN_CHROMIUM_CHANNEL, which decision B requires.

**Correct text:**   - `const shop = await startShopServer()` (no arguments). For each page, call `auditUrlWithHooks(`${shop.baseUrl}/${page}`, { allowPrivate: true }, { beforeClose })` (hook added in Task 0). The Chromium channel comes from `UNSEEN_CHROMIUM_CHANNEL` (PowerShell: `$env:UNSEEN_CHROMIUM_CHANNEL='chromium'`).
  - In `beforeClose(page, raw)`, with the page still open, resolve every selector in expected-hauntings.json[page] (hauntings[*].selectors and controls[*]) through CDP `DOM.getDocument({depth:-1})` + `DOM.querySelectorAll` + `DOM.describeNode` into `{self: number[], subtree: number[]}`. Fail if `document.querySelectorAll('*').length !== raw.boundingBoxes.length`, if any self id is missing from raw.boundingBoxes, or if a non-CursedLoop selector matches anything other than exactly 1 element.
  - Before writing, assert `raw.collectionErrors.length === 0` and endReason: index 'body', product 'body', checkout 'trap' (golden $meta.walkNote).

## 71. .kiro/specs/haunting-classifier/tasks.md:24

**Contradiction:** Task 1 still offers a choice and goes against decision B ("ESM .mjs (no __dirname, no tsx)"). Line 24 says "no tsx initially", and line 32 says "...capture.mjs\" or add tsx to devDependencies". The task also never says what the .mjs imports. Node type stripping cannot load src/*.ts, because src uses `.js` import specifiers (for example './audit.js'), so the script has to import the built dist.

**Correct text:**   - Create `packages/core/tests/fixtures/capture.mjs`: plain ESM JavaScript, no TypeScript syntax, no `__dirname`, no tsx. Resolve paths with `fileURLToPath(new URL('./raw/', import.meta.url))`.
  - Imports: `import { auditUrlWithHooks } from '../../dist/audit.js'`, `import { getPool } from '../../dist/index.js'`, `import { startShopServer } from './shop-server.ts'` (type-stripped).
  - Add to packages/core/package.json: `"capture:fixtures": "npm run build && node --experimental-strip-types tests/fixtures/capture.mjs"`. Run it with `npm run capture:fixtures -w @the-unseen/core`.
  - Do not add tsx.

## 72. .kiro/specs/haunting-classifier/tasks.md:75

**Contradiction:** Task 2.6 places the fast-check arbitraries at `packages/core/src/classifier/test-arbitraries.ts`. tsconfig.json excludes only `**/*.test.ts`, so `npm run build` would emit this file into dist and make production code import fast-check, which is a devDependency. The task also does not say that `arbRawAudit` must generate the Task 0 fields (domNodes and the new ids) that every detector now reads.

**Correct text:**   - [ ] 2.6 Create test arbitraries
    - Create `packages/core/tests/classifier/arbitraries.ts`. It is type-checked by tsconfig.test.json and not shipped in dist.
    - Export `arbRawAudit` (including domNodes with a consistent parentId tree, imgSrcAttributes, heading/html/body ids and axe node ids that reference existing nodes) and `arbHaunting`.
    - Import them from the `src/classifier/*.test.ts` files.

## 73. .kiro/specs/haunting-classifier/tasks.md:403

**Contradiction:** No task writes the blocking-type table into steering, although Req 12.6 says "Record the blocking-type table in steering §Severity for sign-off", and finding 49's verifier says the steering wins, so the list must go into hauntings.md first. Task 14.0 covers only precedence.

**Correct text:** - [ ] 12.0 Append the blocking-type table to `.kiro/steering/hauntings.md` §Severity
  - Wraith-eligible: CursedLoop, NamelessSpirit, WhisperingField, LostSoul.
  - Never Wraith: HollowPortrait, TheFog, InvisibleWanderer, TheVeiled, ShatteredOrder, SilentTongue.
  - Core-task ancestry (form, dialog, checkout/cart region), and the example that a checkout-button Nameless Spirit is always Wraith.
  - Must land before 12.1. _Requirements: 12.1, 12.6_

## 74. .kiro/specs/haunting-classifier/tasks.md:575

**Contradiction:** Task 19.2 points to design.md 1105-1126 for the boundary test. That test reads `d.path` from `readdirSync(..., {withFileTypes:true, recursive:true})`; Dirent.path is deprecated, and repo Node is 24. Its regex `/import .* from ['"](.*)['"]/` misses `export ... from`, multi-line imports and dynamic `import()`, so a runner import can slip through. The ESLint snippet in design.md 1128-1145 is the legacy `.eslintrc` `overrides` format that ESLint 9 ignores, which contradicts task 19.1.

**Correct text:**   - 19.2:
    - Walk `packages/core/src/classifier` with `readdirSync(dir, { recursive: true })`, joining relative paths.
    - Match every `from '...'`, `import('...')` and `require('...')` specifier.
    - Resolve each relative specifier against the file's directory and fail if it lands under `packages/core/src/runner`.
  - Replace design.md 1128-1145 with the flat `eslint.config.js` from task 19.1, and also forbid the bare `**/runner` pattern.

## 75. .kiro/specs/haunting-classifier/tasks.md:629

**Contradiction:** Task 22.3 says "Start cursed-shop server ... using startShopServer() with { allowPrivate: true }" and "Close server and getPool() in afterAll". startShopServer() takes no options, and getPool() returns the pool; it does not close it. The task does not say where the test lives. It launches a browser, but vitest.config includes only `src/**/*.test.ts`, and Playwright runs only `tests/**/*.int.spec.ts`.

**Correct text:**   - [ ] 22.3 Create `packages/core/tests/audit-and-classify.int.spec.ts` (Playwright)
    - `const shop = await startShopServer()` in beforeAll.
    - Call `auditAndClassify(`${shop.baseUrl}/index.html`, { allowPrivate: true })`.
    - Assert a valid ClassifiedAudit with score > 0 and non-empty hauntings.
    - In afterAll: `await shop.close(); await getPool().close()`.
    - Run: `npx playwright test` in packages/core.

## 76. .kiro/specs/haunting-classifier/requirements.md:396

**Contradiction:** Req 29.2 keeps `wcag` (primary) plus `wcagAlso: WCAGCriterion[]`. Decision E says "`Haunting.wcag` becomes an array: the full criteria list from the steering", and decisions outrank requirements. Req 2.5 ("`wcagAlso` SHALL contain...") has the same deviation.

**Correct text:** 29.2: THE Haunting type SHALL include `wcag: WCAGCriterion[]`, the full steering criteria list for the instance, with wcag[0] as the primary criterion used by the severity level-A rule, plus `guidance?: WCAGCriterion` (2.4.13 for Invisible Wanderer). 2.5: wcag = [4.1.2], plus 2.4.4 when the role is link, plus 1.1.1 when the control's only content is an image.

## 77. .kiro/specs/haunting-classifier/requirements.md:75

**Contradiction:** Req 3.9 reads the svg role from `RawAudit.explicitRoles (runner prerequisite task)`, and Req 11.7 may require `isHiddenRoot`. Neither field is in Req 0 or Task 0. Decision D already provides the `role` and `aria-hidden` attributes in domNodes. Req 0.6 and 0.7 describe the same axe resolution under two names (`backendDOMNodeId` and `axeNodeIds`). Req 7.6 leaves out decision C's "empty `backendDOMNodeId`" steps. Req 9 never names the html node id. Req 10.1 (no-h1) never names the body node id, although decision C says "Never nodeIds: []".

**Correct text:** - 3.9: read the explicit role from `domNodes[id].attrs.role`.
- 11.7: identify the root from `domNodes` attrs['aria-hidden'] or role plus the parentId chain. Delete the isHiddenRoot fallback.
- 0.6 and 0.7: merge them as "`AxeViolationNode` keeps `target` and gains `backendDOMNodeId: number | null` (the axeNodeIds resolution) at collection time".
- 7.6: steps with `cdpError === true` or `backendDOMNodeId === ''` go to needsManualCheck ('focus-style-unavailable').
- 9.6 (new): Silent Tongue nodeIds = [pageMetadata.htmlBackendDOMNodeId].
- 10.1: no-h1 nodeIds = [bodyBackendDOMNodeId].

## 78. .kiro/specs/haunting-classifier/REVIEW_RESOLUTION.md:13

**Contradiction:** Findings 1, 8 and 13 are marked "DONE" in "requirements.md | Req 15.5, 30.8". The requirements are amended, but the fix is incomplete. Design §Golden test (design.md 1053) still says "Assert `countsByType` matches". Task 18.1 never computes detectedCountsByType. Tasks 21.x do not assert the per-type union of node ids that decision A requires.

**Correct text:** | 1, 8, 13 | A | requirements.md (Req 15.5, 30.8, 20.1-20.3); design.md types (secondary, detectedCountsByType) | PARTIAL: design.md 1053 still asserts countsByType; tasks 18.1 and 21.x lack detectedCountsByType construction and the node-id union assertion |

## 79. .kiro/specs/haunting-classifier/REVIEW_RESOLUTION.md:22

**Contradiction:** Findings 10 and 14 are marked DONE in "Req 20.4". The requirement text matches verify.mjs CONTROL_GUARD. But finding 14's fix also says "Add the table to the design's golden-test section and to tasks 21.x", and neither design.md 1050-1055 nor tasks 21.1-21.3 contain a control assertion.

**Correct text:** | 10, 14 | A | requirements.md Req 20.4 | PARTIAL: control-guard assertions missing from design golden test and tasks 21.x |

## 80. .kiro/specs/haunting-classifier/REVIEW_RESOLUTION.md:72

**Contradiction:** The Group B summary lists "(findings 2, 9, 15, 36, 37)", but prompt 20 defines B as 9, 15, 36, 37; finding 2 is group C. The "Next Steps" section (lines 116-136) lists the design.md amendments, and tasks.md items such as "Add Task 0", as still to do. That contradicts the table marking every finding DONE. The Validation Checklist (lines 140-153) ticks "Design.md algorithms match requirements exactly", "No contradictions between the three files", "All runner prerequisites are listed in Task 0" and "Golden test logic matches the sidecar file approach", and none of these is true (see design.md 710, 787, 970, 274, 1046-1097; Task 0 lacks the page-open hook and determinism normalise update; explicitRoles has no task).

**Correct text:** Group B: findings 9, 15, 36, 37. Replace 'Next Steps' with an accurate open list: design.md detector pseudo-code (§4-§10), §Precedence, §Severity, §Speech, §Testing Strategy (golden, capture, ESLint, commands); tasks 0, 1, 8.3, 8.5, 9.3-9.6, 11.x, 12.x, 14.x, 17.1, 18.1, 21, 22.3 and the dependency graph. Untick the four checklist items until they are verified against the text.
