# Design Document: Haunting Classifier

## Overview

The haunting classifier is the pure functional layer of THE UNSEEN audit engine. It transforms raw browser data (`RawAudit`) into classified accessibility issues (`ClassifiedAudit`) by applying 10 detection algorithms defined in `.kiro/steering/hauntings.md`, assigning severity levels, computing a Haunting Score, and generating screen-reader speech text.

**Key properties:**
- **Pure functions only**: No I/O, no mutation, no non-deterministic operations
- **Strict boundary**: No imports from `packages/core/src/runner/` are permitted
- **Property-tested**: All algorithms verified with fast-check for 100+ random inputs
- **Golden-tested**: Exact haunting counts verified against `apps/cursed-shop/expected-hauntings.json`

The classifier operates on data already collected by the browser runner (AX tree, axe violations, Tab walk, text styles, event listeners) and returns a scored, explained, and cross-referenced set of hauntings.

## Architecture

### Module Layout

```
packages/core/src/classifier/
├── classify.ts              # Main entry point: classify(raw: RawAudit)
├── types.ts                 # Haunting, ClassifiedAudit, detector types
├── detectors/
│   ├── nameless-spirit.ts   # Detector #1: interactive elements with empty names
│   ├── hollow-portrait.ts   # Detector #2: images with missing alt text
│   ├── fog.ts               # Detector #3: low-contrast text
│   ├── lost-soul.ts         # Detector #4: clickable but not keyboard-accessible
│   ├── cursed-loop.ts       # Detector #5: keyboard traps
│   ├── invisible-wanderer.ts# Detector #6: missing focus indicators
│   ├── whispering-field.ts  # Detector #7: form fields with no/placeholder labels
│   ├── silent-tongue.ts     # Detector #8: missing/invalid lang attribute
│   ├── shattered-order.ts   # Detector #9: heading/landmark structure issues
│   └── veiled.ts            # Detector #10: content hidden from AT
├── severity.ts              # Severity assignment: Wraith/Restless/Banished
├── precedence.ts            # Primary/secondary haunting deduplication
├── score.ts                 # Haunting Score computation with exponential curve
├── speech.ts                # Speech announcement generation (name, role, state)
├── contrast.ts              # WCAG luminance and contrast ratio computation
├── explanation.ts           # Generate explanation, persona, and fix for each haunting
└── axe-cross-check.ts       # Map hauntings to axe violations by backendDOMNodeId
```

### Data Flow

```
RawAudit
  │
  ├─→ All 10 detectors (run in parallel)
  │     │
  │     └─→ UnclassifiedHaunting[] (explanation, persona, fix, speech, speechNote, soundCue already filled)
  │
  ├─→ Precedence resolver
  │     │
  │     └─→ Primary hauntings (each with secondary: UnclassifiedHaunting[])
  │
  ├─→ Severity assigner
  │     │
  │     └─→ Haunting[] (with Wraith/Restless/Banished)
  │
  ├─→ Score computer
  │     │
  │     └─→ number (0-100 Haunting Score)
  │
  ├─→ Count by type (countsByType: primary only; detectedCountsByType: primary + secondary, deduplicated per element)
  │
  ├─→ Axe cross-checker
  │     │
  │     └─→ AxeCrossCheck (map hauntings ↔ axe violations)
  │
  ├─→ Needs manual check list (contrast-uncertain text, Tab steps with cdpError or empty backendDOMNodeId)
  │
  └─→ ClassifiedAudit
```

## Components and Interfaces

### Core Types

```typescript
// packages/core/src/classifier/types.ts

export type HauntingType =
  | "NamelessSpirit"
  | "HollowPortrait"
  | "TheFog"
  | "LostSoul"
  | "CursedLoop"
  | "InvisibleWanderer"
  | "WhisperingField"
  | "SilentTongue"
  | "ShatteredOrder"
  | "TheVeiled"

export type HauntingSeverity = "Wraith" | "Restless" | "Banished"

export type Haunting = {
  id: string // stable hash of type + backendDOMNodeId + kind
  type: HauntingType
  kind?: string // for ShatteredOrder: "no-h1" | "heading-skip" | "no-main"
  severity: HauntingSeverity
  wcag: WCAGCriterion[] // full criteria list from hauntings.md, primary first
  guidance?: WCAGCriterion // Invisible Wanderer only: WCAG_2_4_13 (never 2.4.11)
  nodeIds: number[] // backendDOMNodeId for affected elements; never []
  box: BoundingBox | null // primary element's box; null when no box available
  speech?: string // screen-reader announcement for this element
  speechNote?: string // e.g. "name disappears when typing"
  soundCue?: string // e.g. "garbled-whisper", "chime"
  htmlSnippet: string // ≤ 300 chars; outerHTML from domNodes
  explanation: string // what is wrong (1-2 sentences)
  persona: string // who is affected (1 sentence starting with "As a")
  fix: HauntingFix
  isPrimary: boolean // true for primary hauntings (scored); false for secondary
  secondary: Haunting[] // lower-precedence hauntings on colliding nodeIds
}

export type WCAGCriterion = {
  id: string // e.g. "4.1.2"
  level: "A" | "AA" | "AAA"
  title: string // e.g. "Name, Role, Value"
  url: string // https://www.w3.org/WAI/WCAG22/Understanding/...
}

export type HauntingFix = {
  instruction: string // plain-language fix steps
  codeSnippet: string // HTML/ARIA template with placeholders
}

export type ClassifiedAudit = {
  hauntings: Haunting[] // primary hauntings only (isPrimary: true), with their secondary arrays
  score: number // 0-100 Haunting Score
  countsByType: Record<HauntingType, number> // counts primary hauntings only (for scoring)
  detectedCountsByType: Record<HauntingType, number> // primary + secondary per element (for golden test)
  needsManualCheck: ManualCheckNode[]
  automatedCoverageNote: string
  axeCrossCheck: AxeCrossCheck
  raw: RawAudit // the original input, for reference
}

export type ManualCheckNode = {
  backendDOMNodeId: number
  reason: "contrast-uncertain" | "off-screen-content" | "focus-style-unavailable"
  htmlSnippet: string
}

export type AxeCrossCheck = {
  hauntingToAxe: Record<string, string[]> // haunting.id → axe rule IDs
  unmapped: AxeViolation[] // axe violations with no corresponding haunting
}

export type UnclassifiedHaunting = Omit<Haunting, "severity" | "isPrimary" | "secondary">

export type DetectorFunction = (raw: RawAudit) => UnclassifiedHaunting[]
```

### Speech Types

```typescript
// packages/core/src/classifier/speech.ts

export type SpeechComponents = {
  name: string
  role: string
  state: string
}

export type RoleLabel = string // human-readable role name
export type StateLabel = string // e.g. "checked", "expanded", "dimmed"

export const ROLE_LABEL_MAP: Record<string, RoleLabel> = {
  button: "button",
  link: "link",
  checkbox: "checkbox",
  radio: "radio button",
  switch: "switch",
  textbox: "edit text",
  searchbox: "search",
  spinbutton: "spin button",
  slider: "slider",
  combobox: "combo box",
  listbox: "list box",
  option: "option",
  menuitem: "menu item",
  menuitemcheckbox: "menu item checkbox",
  menuitemradio: "menu item radio",
  tab: "tab",
  treeitem: "tree item",
  gridcell: "grid cell",
  img: "graphic",
  image: "graphic",
  heading: "heading", // append " level N"
  list: "list",
  listitem: "list item",
  table: "table",
  row: "row",
  columnheader: "column header",
  rowheader: "row header",
  cell: "cell",
  form: "form",
  region: "region",
  main: "main",
  navigation: "navigation",
  banner: "banner",
  contentinfo: "content info",
  complementary: "complementary",
  dialog: "dialog",
  alertdialog: "alert dialog",
  alert: "alert",
  status: "status",
  log: "log",
}
```

### Contrast Types

```typescript
// packages/core/src/classifier/contrast.ts

export type RGBColor = {
  r: number // 0-255
  g: number // 0-255
  b: number // 0-255
}

export type Luminance = number // 0-1 (relative luminance per WCAG)
export type ContrastRatio = number // 1-21
```

## Data Models

### Detector Input and Output

Every detector is a pure function:

```typescript
type DetectorFunction = (raw: RawAudit) => UnclassifiedHaunting[]
```

**Input:** `RawAudit` from `packages/core/src/types.ts`. The detector reads only the fields it needs:
- `axNodes` — AX tree from CDP
- `axeViolations` — axe-core results (nodes[].backendDOMNodeId for cross-check)
- `textNodeStyles` — contrast data
- `eventListenerSignals` — click handlers
- `tabWalkResult` — Tab walk steps, cycles, trapDetected, trapRegionNodeIds
- `pageMetadata` — lang, headings (with backendDOMNodeId), landmarks, htmlBackendDOMNodeId, bodyBackendDOMNodeId
- `domAxMapping` — DOM-to-AX presence mapping
- `imgAltAttributes` — alt attribute values
- `imgSrcAttributes` — src attribute values (for Hollow Portrait filename extraction)
- `boundingBoxes` — element positions
- `domNodes` — Record<backendDOMNodeId, DomNodeInfo { tag, parentId, attrs, outerHTMLSnippet }>

**Output:** `UnclassifiedHaunting[]`. Each has `type`, `kind?`, `wcag: WCAGCriterion[]`, `guidance?`, `nodeIds` (never []), `box`, `speech?`, `speechNote?`, `soundCue?`, `htmlSnippet` (from domNodes outerHTMLSnippet), `explanation`, `persona`, and `fix`, but **not** `severity`, `isPrimary` or `secondary` (those are assigned later).

### Precedence Model

When multiple detection rules match elements that share any backendDOMNodeId in their `nodeIds`, assign exactly one **primary haunting** and mark the others as **secondary**. Only primary hauntings are scored.

**Precedence order (highest to lowest):**
1. Cursed Loop
2. Nameless Spirit
3. Whispering Field
4. Lost Soul
5. Hollow Portrait
6. The Veiled
7. Invisible Wanderer
8. The Fog

**Collision rule:** Two hauntings collide when their `nodeIds` arrays share ANY `backendDOMNodeId`. For CursedLoop, `nodeIds` = `trapRegionNodeIds` (the region element first, followed by all cycle members), so all of these node IDs take part in precedence. SilentTongue and ShatteredOrder never take part in precedence and are always primary.

**Algorithm:**
1. Stable-sort all participating hauntings (exclude SilentTongue and ShatteredOrder) by precedence order.
2. Initialize `claimed: Map<backendDOMNodeId, primaryHaunting>`.
3. For each haunting `h` in order:
   - `owners` = the set of distinct primary hauntings that have already claimed any `backendDOMNodeId` in `h.nodeIds`.
   - If `owners` is empty, mark `h` as primary (`isPrimary: true`, `secondary: []`) and claim all of `h.nodeIds`.
   - Otherwise, push `h` into the `secondary` array of its highest-precedence owner (the owner that appears first in the precedence list).
4. Return the primary hauntings only (plus SilentTongue/ShatteredOrder), each with its `secondary` array populated.

**Example:** A Cursed Loop member that is also a Whispering Field will have the Whispering Field become a secondary of the loop, because the loop's `nodeIds` (which equals `trapRegionNodeIds`) includes that input's `backendDOMNodeId`, and Cursed Loop outranks Whispering Field. The Whispering Field is still counted in `detectedCountsByType`.

### Severity Assignment

Apply these rules in order (first match wins):

**Blocking-type table:**
| Type | Can block task? |
|------|----------------|
| CursedLoop | Yes |
| NamelessSpirit | Yes |
| WhisperingField | Yes |
| LostSoul | Yes |
| HollowPortrait | No (never Wraith) |
| TheFog | No (never Wraith) |
| InvisibleWanderer | No (never Wraith) |
| TheVeiled | No (never Wraith) |
| ShatteredOrder | No (never Wraith) |
| SilentTongue | No (never Wraith) |

1. **Wraith** — the haunting type can block tasks (see table above) AND the element is part of a core task flow.
2. **Restless** — the number of primary hauntings of this type on the page (after precedence) is ≥3, OR the WCAG criterion `wcag[0].level === 'A'`.
3. **Banished** — all other hauntings.

**Core task flow detection (for rule 1):**
- Walk the element (by `nodeIds[0]`) and its ancestors via `raw.domNodes[id].parentId` up to `body`.
- The element is part of a core task flow if **any** of the following is true:
  - Some ancestor has `tag === 'form'`
  - Some ancestor or the element itself has `tag === 'dialog'` or `attrs.role === 'dialog'` or `attrs.role === 'alertdialog'`
  - Some ancestor or the element itself has an `id` or `class` containing "checkout" or "cart" (case-insensitive substring match)
  - The element's AX role is `button` or `link`, AND the accessible name OR (when the name is empty) the element's `domNodes` attributes (`id`, `class`, `aria-label`) or `outerHTMLSnippet` contains one of these keywords (case-insensitive): "submit", "checkout", "buy", "pay", "login", "sign in", "sign up", "search", "continue", "cart", "add to", "basket", "register", "subscribe"

**Example:** A checkout button that is a Nameless Spirit is always Wraith, because the keyword "checkout" (in its class or surrounding text) triggers the core-task rule even though the accessible name is empty.

**Input:** The primary hauntings returned by `resolvePrecedence` (each with its `secondary` array), plus `raw: RawAudit` (for DOM/AX traversal to check ancestry and accessible names).

**Output:** `Haunting[]` with `severity` field populated.

### Score Computation

**Formula:**
```
rawScore = sum of (weight × count) for each severity
score = round(100 × (1 - exp(-rawScore / 120)))
```

**Weights:**
- Wraith: 20
- Restless: 8
- Banished: 3

**Input:** `Haunting[]` where `isPrimary: true`. Count by severity (not by type).

**Output:** `number` in range [0, 100].

**Edge cases:**
- Empty input → 0
- Single Wraith → ≈15
- Five Wraiths → ≈57
- Twenty Wraiths → ≈96

**Invariants (enforced by property tests):**
1. Deterministic
2. Monotonic non-decreasing
3. Order-independent
4. Bounded [0, 100]
5. Zero baseline
6. Severity-dominance

### Speech Announcement Generation

**Formula:**
```typescript
announcement = [name, role, state].filter(Boolean).join(", ")
```

**Components:**
- **name** — `axNode.name.value.trim()` (omit if empty)
- **role** — human-readable label from `ROLE_LABEL_MAP` (always included)
- **state** — computed from `axNode.states` and `axNode.properties` (omit if not relevant)

**Special cases (from hauntings.md verbatim):**
- Empty name + interactive role → haunting (#1 or #7), announce only the role
- `textbox`/`searchbox`/`spinbutton`/`slider`/`combobox` with empty name → `"<roleLabel>, blank"` (e.g. `"edit text, blank"`, `"search, blank"`)
- Placeholder-only name → `"<placeholder text>, edit text"` **with** `speechNote: "name disappears when typing"`
- `img`/`image` with empty name → `"unlabelled graphic, [filename]"` where filename is extracted from `imgSrcAttributes[id]` (last path segment, no query or hash), or `"unlabelled graphic"` if no src
- `role: "heading"` → append `" level N"` where N is from `aria-level` property or inferred from tag name
- `role: "generic"`, `"none"`, `"presentation"` → return empty string (do not announce)

**Sound effects (never in `speech`):**
- Silent Tongue: `soundCue: "garbled-whisper"`
- Cursed Loop: `soundCue: "chime"`

**Exported functions:**
- `announce(node: AXNode, raw: RawAudit): string` — the full announcement
- `announceNote(node: AXNode): string | undefined` — returns `"name disappears when typing"` for placeholder-only names, otherwise `undefined`

**State inclusion rules:**
| Role | State to include | Source Property | Format |
|------|------------------|----------------|--------|
| checkbox, menuitemcheckbox | checked, unchecked, mixed | `checked` ('true'\|'false'\|'mixed') | "checked" / "unchecked" / "mixed" |
| radio, menuitemradio | selected, unselected | `checked` ('true' → "selected", otherwise "unselected") | "selected" / "unselected" |
| switch | on, off | `checked` | "on" / "off" |
| button | pressed (if `aria-pressed=true`) | `pressed` | "pressed" |
| option | selected | `selected` | "selected" |
| tab | selected | `selected` | "selected" |
| combobox, treeitem | expanded, collapsed | `expanded` | "expanded" / "collapsed" |
| Any | disabled | `disabled` | "dimmed" |
| Any | required | `required` | "required" |
| heading | level N | `level` property | append " level N" |

**Input:** `AXNode` from the `RawAudit`, plus `raw` for `imgSrcAttributes` lookup.

**Output:** `string` (the announcement text).

### Contrast Computation

**Luminance formula (WCAG 2.x):**
```typescript
function relativeLuminance(rgb: RGBColor): Luminance {
  const channels = [rgb.r, rgb.g, rgb.b].map(ch => {
    const sRGB = ch / 255
    return sRGB <= 0.03928 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}
```

**Contrast ratio formula:**
```typescript
function contrastRatio(c1: RGBColor, c2: RGBColor): ContrastRatio {
  const L1 = relativeLuminance(c1)
  const L2 = relativeLuminance(c2)
  const lighter = Math.max(L1, L2)
  const darker = Math.min(L1, L2)
  return (lighter + 0.05) / (darker + 0.05)
}
```

**Thresholds:**
- Normal text: 4.5:1
- Large text (≥24px or ≥18.66px + bold ≥700): 3:1

**Input:** `color` and `backgroundColor` from `TextNodeStyle`, parsed from CSS colour strings to `RGBColor`.

**Output:** `ContrastRatio` (1-21).

**Property invariants:**
1. Symmetric: `contrastRatio(c1, c2) === contrastRatio(c2, c1)`
2. Identical colours: `contrastRatio(c, c) === 1`
3. Bounded: `1 <= contrastRatio(c1, c2) <= 21`

## Detector Algorithms

### 1. Nameless Spirit

**Rule:** AX node has an interactive role AND accessible name is empty.

**Interactive roles:** `button`, `link`, `menuitem`, `menuitemcheckbox`, `menuitemradio`, `tab`, `checkbox`, `radio`, `switch`, `option`, `combobox`, `listbox`, `treeitem`, `gridcell`.

**Algorithm:**
```typescript
function detectNamelessSpirit(raw: RawAudit): UnclassifiedHaunting[] {
  const interactiveRoles = new Set([
    "button", "link", "menuitem", "menuitemcheckbox", "menuitemradio",
    "tab", "checkbox", "radio", "switch", "option", "combobox", "listbox",
    "treeitem", "gridcell"
  ])
  
  const hauntings: UnclassifiedHaunting[] = []
  
  for (const node of raw.axNodes) {
    if (node.ignored) continue
    const role = String(node.role.value)
    const name = String(node.name.value ?? "").trim()
    
    if (interactiveRoles.has(role) && name === "") {
      const id = node.backendDOMNodeId
      const onlyContentIsImage = false // TODO: check if button/link contains only an image child
      
      hauntings.push({
        id: hauntingId("NamelessSpirit", id),
        type: "NamelessSpirit",
        wcag: [
          WCAG_4_1_2,
          ...(role === "link" ? [WCAG_2_4_4] : []),
          ...(onlyContentIsImage ? [WCAG_1_1_1] : [])
        ],
        nodeIds: [id],
        box: findBox(raw.boundingBoxes, id),
        speech: announce(node, raw), // will be just the role
        htmlSnippet: snippet(raw, id),
        explanation: `Interactive element has no accessible name. Screen readers announce only "${ROLE_LABEL_MAP[role] || role}", leaving users unable to identify its purpose.`,
        persona: "As a screen-reader user, I cannot determine what this control does.",
        fix: generateFix("NamelessSpirit", { role }),
      })
    }
  }
  
  return hauntings
}
```

**WCAG mapping:** 4.1.2 (Name, Role, Value) — always. Also 2.4.4 (Link Purpose) for links, and 1.1.1 (Non-text Content) for buttons containing only an image.

### 2. Hollow Portrait

**Rule:** AX node has role `img` or `image` AND name is empty AND `alt` is not explicitly `""`.

**Exclusions:**
- `alt=""` (intentionally decorative)
- `role="presentation"` or `role="none"`
- `aria-hidden="true"` (always skipped: the AX node is ignored)
- An image or inline SVG that is the sole content of a button/link whose name is empty (not reported; the parent is reported as Nameless Spirit)
- Inline SVG inside an already-named control
- Inline SVG without an explicit `role="img"` attribute

**Algorithm:**
```typescript
function detectHollowPortrait(raw: RawAudit): UnclassifiedHaunting[] {
  const hauntings: UnclassifiedHaunting[] = []
  
  for (const node of raw.axNodes) {
    if (node.ignored) continue
    const role = String(node.role.value)
    
    // Treat "img" and "image" as equivalent
    if (role !== "img" && role !== "image") continue
    
    const name = String(node.name.value ?? "").trim()
    if (name !== "") continue // has a name, not hollow
    
    const id = node.backendDOMNodeId
    
    // Check if alt="" (intentionally decorative)
    const altAttr = raw.imgAltAttributes[String(id)]
    if (altAttr === "") continue // correctly decorative
    
    const dn = raw.domNodes[id]
    
    // SVG without explicit role="img" attribute
    if (dn?.tag === "svg" && dn.attrs.role !== "img") continue
    
    // Check if sole content of unnamed button/link
    const parent = axParent(raw, node)
    if (parent && ["button", "link"].includes(String(parent.role.value))) {
      const parentName = String(parent.name.value ?? "").trim()
      if (soleNonIgnoredChild(raw, parent, node) && parentName === "") {
        continue // parent is Nameless Spirit
      }
      // SVG inside named control
      if (dn?.tag === "svg" && parentName !== "") continue
    }
    
    const filename = fileNameFromSrc(raw.imgSrcAttributes[String(id)])
    const speechText = filename ? `unlabelled graphic, ${filename}` : "unlabelled graphic"
    
    hauntings.push({
      id: hauntingId("HollowPortrait", id),
      type: "HollowPortrait",
      wcag: [WCAG_1_1_1],
      nodeIds: [id],
      box: findBox(raw.boundingBoxes, id),
      speech: speechText,
      htmlSnippet: snippet(raw, id),
      explanation: "Image has no text alternative. Screen-reader users miss the visual information.",
      persona: "As a screen-reader user, I cannot see the image and have no description.",
      fix: generateFix("HollowPortrait", {}),
    })
  }
  
  return hauntings
}
```

**Speech generation:** `"unlabelled graphic, [filename]"` where filename is extracted from `imgSrcAttributes[id]` (last path segment, no query or hash), or `"unlabelled graphic"` when there is no src.

**WCAG mapping:** 1.1.1 (Non-text Content).

### 3. The Fog

**Rule:** Text contrast ratio below 4.5:1 for normal text, or below 3:1 for large text.

**Exclusions:**
- `backgroundUncertain: true` (gradient/image background — goes to `needsManualCheck` instead)
- Disabled text (`aria-disabled` or `:disabled`)
- Decorative text (empty alt, role none/presentation)

**Algorithm:**
```typescript
function detectTheFog(raw: RawAudit): UnclassifiedHaunting[] {
  const hauntings: UnclassifiedHaunting[] = []
  
  for (const [nodeIdStr, style] of Object.entries(raw.textNodeStyles)) {
    // Skip uncertain backgrounds
    if (style.backgroundUncertain) continue
    
    const id = Number(nodeIdStr)
    
    // Skip disabled text
    if (isDisabled(raw, id)) continue
    
    // Skip decorative text
    if (isDecorative(raw, id)) continue
    
    // Parse colors
    const fg = parseCssColor(style.color)
    const bg = parseCssColor(style.backgroundColor)
    if (!fg || !bg) continue
    
    const ratio = contrastRatio(fg, bg)
    const threshold = style.isLargeText ? 3.0 : 4.5
    
    if (ratio < threshold) {
      hauntings.push({
        id: hauntingId("TheFog", id),
        type: "TheFog",
        wcag: [WCAG_1_4_3],
        nodeIds: [id],
        box: findBox(raw.boundingBoxes, id),
        speech: undefined, // no speech for Fog
        htmlSnippet: snippet(raw, id),
        explanation: `Text contrast is ${ratio.toFixed(2)}:1, below the required ${threshold}:1. Low-vision users struggle to read it.`,
        persona: "As a low-vision user, I strain to read this text.",
        fix: generateFix("TheFog", { ratio, threshold }),
      })
    }
  }
  
  // backgroundUncertain nodes are collected by classify() into needsManualCheck
  
  return hauntings
}
```

**WCAG mapping:** 1.4.3 (Contrast Minimum).

### 4. Lost Soul

**Rule:** Element has a click handler AND is not in Tab walk AND does not have an interactive ARIA role AND is not a native interactive element.

**Native interactive elements:** `<button>`, `<a href>` (AX role link), `<input>`, `<select>`, `<textarea>`, `<summary>`, `[contenteditable]`.

**Outermost rule:** Report only the outermost qualifying element. If a child and ancestor both match, report the ancestor.

**Skip rule:** Skip elements inside or containing native interactive elements.

**Algorithm:**
```typescript
function detectLostSoul(raw: RawAudit): UnclassifiedHaunting[] {
  const hauntings: UnclassifiedHaunting[] = []
  const tabWalkNodeIds = new Set(raw.tabWalkResult.steps.map(s => Number(s.backendDOMNodeId)))
  const interactiveRoles = new Set(INTERACTIVE_ROLES)
  
  // Build candidate set: elements with click handlers
  const candidates = raw.eventListenerSignals.filter(sig =>
    sig.eventTypes.some(t => ["click", "mousedown", "pointerdown", "pointerup"].includes(t))
  )
  
  // Filter: not in Tab walk, not native interactive, not interactive ARIA role
  const qualifying = candidates.filter(sig => {
    const id = sig.backendDOMNodeId
    
    // In Tab walk? Skip.
    if (tabWalkNodeIds.has(id)) return false
    
    // Native interactive element? Skip.
    if (isNativeInteractive(raw, id)) return false
    
    // Check AX role (if element has an AX node)
    const axNode = axByBackendId(raw, id)
    if (axNode && interactiveRoles.has(String(axNode.role.value))) return false
    
    // Inside or contains native interactive? Skip.
    const ancestors = domAncestors(raw, id).concat(axAncestors(raw, axNode))
    if (ancestors.some(aid => isNativeInteractive(raw, aid))) return false
    
    const descendants = domDescendants(raw, id).concat(axNode ? axDescendants(raw, axNode).map(n => n.backendDOMNodeId) : [])
    if (descendants.some(did => isNativeInteractive(raw, did))) return false
    
    return true
  })
  
  // Apply outermost rule
  const outermost = filterOutermost(raw, qualifying.map(s => s.backendDOMNodeId))
  
  for (const id of outermost) {
    hauntings.push({
      id: hauntingId("LostSoul", id),
      type: "LostSoul",
      wcag: [WCAG_2_1_1, WCAG_4_1_2],
      nodeIds: [id],
      box: findBox(raw.boundingBoxes, id),
      speech: undefined, // no speech for Lost Soul
      htmlSnippet: snippet(raw, id),
      explanation: "Element responds to clicks but is not keyboard-accessible. Keyboard users cannot interact with it.",
      persona: "As a keyboard user, I cannot reach this control.",
      fix: generateFix("LostSoul", {}),
    })
  }
  
  return hauntings
}

// Helper: isNativeInteractive(raw, id)
// Returns true if tag is button/input/select/textarea/summary,
// or tag is 'a' with AX role 'link', or element is editable
```

**WCAG mapping:** 2.1.1 (Keyboard), 4.1.2 (Name, Role, Value).

### 5. Cursed Loop

**Rule:** Tab walk visits a cycle before all focusables are visited AND escape test (Escape then Shift+Tab) fails.

**Data source:** `raw.tabWalkResult.cycles` already includes escape-test results.

**Algorithm:**
```typescript
function detectCursedLoop(raw: RawAudit): UnclassifiedHaunting[] {
  const t = raw.tabWalkResult
  
  // At most one Cursed Loop, only when trapDetected
  if (!t.trapDetected || t.trapRegionNodeIds.length === 0) return []
  
  // Check for a true trap (non-escapable, not all-focusables)
  if (!t.cycles.some(c => !c.escapable && !c.includesAllFocusables)) return []
  
  const nodeIds = t.trapRegionNodeIds.map(Number)
  const regionId = nodeIds[0]
  
  return [{
    id: hauntingId("CursedLoop", regionId),
    type: "CursedLoop",
    wcag: [WCAG_2_1_2],
    nodeIds,
    box: findBox(raw.boundingBoxes, regionId),
    speech: undefined,
    soundCue: "chime",
    htmlSnippet: snippet(raw, regionId),
    explanation: `Keyboard trap: focus cycles through ${nodeIds.length - 1} elements with no escape.`,
    persona: "As a keyboard user, I am trapped and cannot navigate to the rest of the page.",
    fix: generateFix("CursedLoop", {}),
  }]
}
```

**Data source:** `tabWalkResult.trapDetected`, `trapRegionNodeIds` and `cycles[].escapable`/`includesAllFocusables`.

**WCAG mapping:** 2.1.2 (No Keyboard Trap).

### 6. Invisible Wanderer

**Rule:** Element is in Tab walk AND focus indicator is not visible.

**Visibility criteria:** At least one of:
- (a) `outline-style` ≠ `none` AND `outline-width` ≥ 1px AND outline colour contrast ≥ 3:1 against `after['adjacent-background-color']`
- (b) `box-shadow` changed to a non-transparent shadow with ≥ 3:1 contrast against `after['adjacent-background-color']`
- (c) `border-color` or `background-color` changed and the contrast between before and after (blended over adjacent background) is ≥ 3:1
- (d) `text-decoration` changed

**Chromium quirk:** Ignore `outline-offset`, `outline-width`, `outline-color` deltas when `outline-style` is `none`.

**Algorithm:**
```typescript
function detectInvisibleWanderer(raw: RawAudit): UnclassifiedHaunting[] {
  const hauntings: UnclassifiedHaunting[] = []
  const seen = new Set<number>()
  
  for (const step of raw.tabWalkResult.steps) {
    const id = step.backendDOMNodeId === '' ? NaN : Number(step.backendDOMNodeId)
    
    // Skip cdpError or empty-id steps (classify() adds them to needsManualCheck)
    if (step.cdpError || !Number.isFinite(id)) continue
    
    // Dedupe: at most one IW per element
    if (seen.has(id)) continue
    seen.add(id)
    
    const { before, after } = step.focusSnapshot
    
    // Check visibility criteria
    const hasVisibleIndicator = (
      hasVisibleOutline(before, after) ||
      hasVisibleBoxShadow(before, after) ||
      hasVisibleColorChange(before, after) ||
      hasTextDecorationChange(before, after)
    )
    
    if (!hasVisibleIndicator) {
      hauntings.push({
        id: hauntingId("InvisibleWanderer", id),
        type: "InvisibleWanderer",
        wcag: [WCAG_2_4_7],
        guidance: WCAG_2_4_13,
        nodeIds: [id],
        box: findBox(raw.boundingBoxes, id),
        speech: undefined, // no speech for Invisible Wanderer
        htmlSnippet: snippet(raw, id),
        explanation: "Element has no visible focus indicator. Keyboard users lose track of their position.",
        persona: "As a keyboard user, I cannot see which element has focus.",
        fix: generateFix("InvisibleWanderer", {}),
      })
    }
  }
  
  return hauntings
}

function hasVisibleOutline(before: ComputedStyleMap, after: ComputedStyleMap): boolean {
  const outlineStyle = after["outline-style"]
  if (outlineStyle === "none") return false
  
  const outlineWidth = parseFloat(after["outline-width"])
  if (outlineWidth < 1) return false
  
  const adj = parseCssColor(after["adjacent-background-color"])
  const oc = parseCssColor(after["outline-color"])
  if (!adj || !oc) return false
  
  return contrastRatio(blend(oc, adj), adj) >= 3
}

function hasVisibleBoxShadow(before: ComputedStyleMap, after: ComputedStyleMap): boolean {
  const s = after["box-shadow"]
  if (!s || s === "none" || s === before["box-shadow"]) return false
  
  const adj = parseCssColor(after["adjacent-background-color"])
  if (!adj) return false
  
  const ratios = (s.match(/rgba?\([^)]*\)/g) ?? [])
    .map(parseCssColor)
    .filter(c => c !== null && c.a > 0)
    .map(c => contrastRatio(blend(c!, adj), adj))
  
  return ratios.length > 0 && Math.max(...ratios) >= 3
}

function hasVisibleColorChange(before: ComputedStyleMap, after: ComputedStyleMap): boolean {
  const adj = parseCssColor(after["adjacent-background-color"])
  if (!adj) return false
  
  for (const p of ["background-color", "border-color"]) {
    if (before[p] === after[p]) continue
    const b = parseCssColor(before[p])
    const a = parseCssColor(after[p])
    if (b && a && contrastRatio(blend(b, adj), blend(a, adj)) >= 3) return true
  }
  
  return false
}

function hasTextDecorationChange(before: ComputedStyleMap, after: ComputedStyleMap): boolean {
  return before["text-decoration"] !== after["text-decoration"]
}
```

**WCAG mapping:** 2.4.7 Focus Visible (AA) — primary. `guidance`: 2.4.13 Focus Appearance (AAA, never 2.4.11).

### 7. Whispering Fieldfunction hasTextDecorationChange(before: ComputedStyleMap, after: ComputedStyleMap): boolean {
  return before["text-decoration"] !== after["text-decoration"]
}
```

**WCAG mapping:** 2.4.7 Focus Visible (AA).

### 7. Whispering Field

**Rule:** AX node has form field role AND (empty name OR placeholder-only name).

**Form field roles:** `textbox`, `searchbox`, `spinbutton`, `slider`, `combobox`.

**Algorithm:**
```typescript
function detectWhisperingField(raw: RawAudit): UnclassifiedHaunting[] {
  const hauntings: UnclassifiedHaunting[] = []
  const formRoles = new Set(["textbox", "searchbox", "spinbutton", "slider", "combobox"])
  
### 7. Whispering Field

**Rule:** AX node has form field role AND (empty name OR placeholder-only name).

**Form field roles:** `textbox`, `searchbox`, `spinbutton`, `slider`, `combobox`.

**Algorithm:**
```typescript
function detectWhisperingField(raw: RawAudit): UnclassifiedHaunting[] {
  const hauntings: UnclassifiedHaunting[] = []
  const formRoles = new Set(["textbox", "searchbox", "spinbutton", "slider", "combobox"])
  
  for (const node of raw.axNodes) {
    if (node.ignored) continue
    const role = String(node.role.value)
    if (!formRoles.has(role)) continue
    
    const name = String(node.name.value ?? "").trim()
    const id = node.backendDOMNodeId
    
    // Case (a): empty name
    if (name === "") {
      hauntings.push({
        id: hauntingId("WhisperingField", id),
        type: "WhisperingField",
        wcag: [WCAG_1_3_1, WCAG_3_3_2, WCAG_4_1_2],
        nodeIds: [id],
        box: findBox(raw.boundingBoxes, id),
        speech: announce(node, raw), // "<roleLabel>, blank"
        htmlSnippet: snippet(raw, id),
        explanation: "Form field has no accessible label. Screen-reader users do not know what to enter.",
        persona: "As a screen-reader user, I do not know what this field is for.",
        fix: generateFix("WhisperingField", { case: "empty" }),
      })
      continue
    }
    
    // Case (b): placeholder-only name
    const win = winningNameSource(node)
    const placeholderOnly = !!win && (
      win.attribute === "placeholder" || 
      win.attribute === "aria-placeholder" || 
      win.type === "placeholder"
    )
    
    if (placeholderOnly) {
      hauntings.push({
        id: hauntingId("WhisperingField", id),
        type: "WhisperingField",
        wcag: [WCAG_1_3_1, WCAG_3_3_2, WCAG_4_1_2],
        nodeIds: [id],
        box: findBox(raw.boundingBoxes, id),
        speech: announce(node, raw), // "<placeholder text>, edit text"
        speechNote: "name disappears when typing",
        htmlSnippet: snippet(raw, id),
        explanation: `Form field uses placeholder as label. The placeholder text "${name}" disappears when the user types, causing confusion.`,
        persona: "As a screen-reader user, I lose the field label as soon as I start typing.",
        fix: generateFix("WhisperingField", { case: "placeholder" }),
      })
    }
  }
  
  return hauntings
}

// Helper: winningNameSource(node)
// Returns the first name.sources entry with superseded !== true and non-empty value.value
```

**WCAG mapping:** 1.3.1 (Info and Relationships), 3.3.2 (Labels or Instructions), 4.1.2 (Name, Role, Value).

### 8. Silent Tongue

**Rule:** `<html>` has no `lang` attribute OR `lang` is not a valid BCP 47 tag.

**Validation regex:** `/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/`

**Algorithm:**
```typescript
function detectSilentTongue(raw: RawAudit): UnclassifiedHaunting[] {
  const hauntings: UnclassifiedHaunting[] = []
  const lang = raw.pageMetadata.htmlLang
  const htmlId = raw.pageMetadata.htmlBackendDOMNodeId
  
  if (!lang) {
    hauntings.push({
      id: hauntingId("SilentTongue", htmlId),
      type: "SilentTongue",
      wcag: [WCAG_3_1_1],
      nodeIds: [htmlId],
      box: findBox(raw.boundingBoxes, htmlId) ?? null,
      speech: undefined,
      soundCue: "garbled-whisper",
      htmlSnippet: snippet(raw, htmlId),
      explanation: "Page has no language declaration. Screen readers cannot choose the correct pronunciation rules.",
      persona: "As a screen-reader user, I hear incorrect pronunciation.",
      fix: generateFix("SilentTongue", {}),
    })
    return hauntings
  }
  
  const bcp47Regex = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/
  if (!bcp47Regex.test(lang)) {
    hauntings.push({
      id: hauntingId("SilentTongue", htmlId),
      type: "SilentTongue",
      wcag: [WCAG_3_1_1],
      nodeIds: [htmlId],
      box: findBox(raw.boundingBoxes, htmlId) ?? null,
      speech: undefined,
      soundCue: "garbled-whisper",
      htmlSnippet: snippet(raw, htmlId),
      explanation: `Language attribute "${lang}" is not a valid BCP 47 tag. Screen readers cannot interpret it.`,
      persona: "As a screen-reader user, I hear incorrect pronunciation.",
      fix: generateFix("SilentTongue", {}),
    })
  }
  
  return hauntings
}
```

**WCAG mapping:** 3.1.1 (Language of Page).

### 9. Shattered Order

**Rule:** Three separate checks, each producing a haunting with a distinct `kind`.

**Kinds:**
- `"no-h1"` — page has no `<h1>`
- `"heading-skip"` — heading levels skip (e.g. h1 → h3)
- `"no-main"` — no `main` landmark

**Algorithm:**
```typescript
function detectShatteredOrder(raw: RawAudit): UnclassifiedHaunting[] {
  const hauntings: UnclassifiedHaunting[] = []
  const { headings, hasMainLandmark, bodyBackendDOMNodeId } = raw.pageMetadata
  const bodyId = bodyBackendDOMNodeId ?? raw.domAxMapping.find(m => m.tagName.toLowerCase() === 'body')!.backendDOMNodeId
  
  // Check (a): no h1
  const hasH1 = headings.some(h => h.tagName === "h1")
  if (!hasH1) {
    hauntings.push({
      id: hauntingId("ShatteredOrder", bodyId, "no-h1"),
      type: "ShatteredOrder",
      kind: "no-h1",
      wcag: [WCAG_1_3_1, WCAG_2_4_6],
      nodeIds: [bodyId],
      box: findBox(raw.boundingBoxes, bodyId) ?? null,
      speech: undefined,
      htmlSnippet: snippet(raw, bodyId),
      explanation: "Page has no main heading (h1). Screen-reader users cannot quickly identify the page purpose.",
      persona: "As a screen-reader user, I do not know what this page is about.",
      fix: generateFix("ShatteredOrder", { kind: "no-h1" }),
    })
  }
  
  // Check (b): heading skips
  const levels = headings.map(h => parseInt(h.tagName.slice(1), 10))
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] - levels[i - 1] > 1) {
      const h = headings[i]
      hauntings.push({
        id: hauntingId("ShatteredOrder", h.backendDOMNodeId, "heading-skip"),
        type: "ShatteredOrder",
        kind: "heading-skip",
        wcag: [WCAG_1_3_1, WCAG_2_4_6],
        nodeIds: [h.backendDOMNodeId],
        box: findBox(raw.boundingBoxes, h.backendDOMNodeId) ?? null,
        speech: undefined,
        htmlSnippet: snippet(raw, h.backendDOMNodeId),
        explanation: `Heading levels skip from h${levels[i - 1]} to h${levels[i]}. Screen-reader users expect a logical hierarchy.`,
        persona: "As a screen-reader user, I am confused by the document structure.",
        fix: generateFix("ShatteredOrder", { kind: "heading-skip" }),
      })
    }
  }
  
  // Check (c): no main landmark
  if (!hasMainLandmark) {
    hauntings.push({
      id: hauntingId("ShatteredOrder", bodyId, "no-main"),
      type: "ShatteredOrder",
      kind: "no-main",
      wcag: [WCAG_1_3_1, WCAG_2_4_6],
      nodeIds: [bodyId],
      box: findBox(raw.boundingBoxes, bodyId) ?? null,
      speech: undefined,
      htmlSnippet: snippet(raw, bodyId),
      explanation: "Page has no main landmark. Screen-reader users cannot quickly jump to the main content.",
      persona: "As a screen-reader user, I cannot skip navigation and jump to content.",
      fix: generateFix("ShatteredOrder", { kind: "no-main" }),
    })
  }
  
  return hauntings
}
```

**WCAG mapping:** 1.3.1 (Info and Relationships), 2.4.6 (Headings and Labels).

### 10. The Veiled

**Rule:** One instance per hidden subtree root: a domAxMapping row with (ariaHidden || isPresentational) whose AX node's ignoredReasons contains 'ariaHiddenElement' or 'presentationalRole' (not 'ariaHiddenSubtree').

**Visibility check:** Non-zero bounding box, not `display:none` / `visibility:hidden`, `opacity > 0`, intersects scrollable area.

**Exclusions:** Purely decorative (`<img alt="">`, `role="presentation"`/`"none"` with no text/focusable children).

**Algorithm:**
```typescript
function detectTheVeiled(raw: RawAudit): UnclassifiedHaunting[] {
  const hauntings: UnclassifiedHaunting[] = []
  const reportedRoots = new Set<number>()
  
  for (const m of raw.domAxMapping) {
    // Must be ariaHidden or presentational
    if (!(m.ariaHidden || m.isPresentational) || m.hasAxNode) continue
    
    // Check if this is a root (not a descendant of another hidden element)
    const ax = axByBackendId(raw, m.backendDOMNodeId)
    const reasons = ax?.ignoredReasons ?? []
    if (!reasons.some(r => r.name === 'ariaHiddenElement' || r.name === 'presentationalRole')) continue
    
    // Skip if ancestor already reported
    if (domAncestors(raw, m.backendDOMNodeId).some(a => reportedRoots.has(a))) continue
    
    // Skip decorative
    if (!(m.hasVisibleText || m.containsFocusable || m.isFocusable)) continue
    
    // Find focusable descendants
    const focusDesc = raw.domAxMapping
      .filter(d => d.isFocusable && d.backendDOMNodeId !== m.backendDOMNodeId)
      .filter(d => domAncestors(raw, d.backendDOMNodeId).includes(m.backendDOMNodeId))
      .map(d => d.backendDOMNodeId)
    
    reportedRoots.add(m.backendDOMNodeId)
    
    hauntings.push({
      id: hauntingId("TheVeiled", m.backendDOMNodeId),
      type: "TheVeiled",
      wcag: [WCAG_1_3_1, WCAG_4_1_2],
      nodeIds: [m.backendDOMNodeId, ...focusDesc],
      box: findBox(raw.boundingBoxes, m.backendDOMNodeId),
      speech: undefined,
      htmlSnippet: snippet(raw, m.backendDOMNodeId),
      explanation: "Visible content is hidden from assistive technology. Screen-reader users miss important information.",
      persona: "As a screen-reader user, I do not know this content exists.",
      fix: generateFix("TheVeiled", { focusable: m.isFocusable || m.containsFocusable }),
    })
  }
  
  return hauntings
}
```

**WCAG mapping:** 1.3.1 (Info and Relationships), 4.1.2 (Name, Role, Value).
        wcag: WCAG_1_3_1, // also 4.1.2
        nodeIds: [mapping.backendDOMNodeId],
        box: findBox(raw.boundingBoxes, mapping.backendDOMNodeId),
        speech: undefined, // silence
        htmlSnippet: extractSnippet(raw, mapping.backendDOMNodeId),
        explanation: "Focusable element is hidden from assistive technology with aria-hidden=\"true\". Keyboard users can focus it, but screen readers announce nothing.",
        persona: "As a screen-reader user, I tab to something I cannot hear.",
        fix: generateVeiledFix("focusable-hidden"),
      })
      continue
    }
    
    // Case (b): visible content excluded from AX tree
    if (!mapping.hasAxNode && (mapping.hasVisibleText || mapping.containsFocusable)) {
      // Skip purely decorative
      if (mapping.isPresentational && !mapping.hasVisibleText && !mapping.containsFocusable) {
        continue
      }
      
      hauntings.push({
        id: generateId("TheVeiled", mapping.backendDOMNodeId),
        type: "TheVeiled",
**WCAG mapping:** 1.3.1 (Info and Relationships), 4.1.2 (Name, Role, Value).

## Error Handling

**Pure functions throw no exceptions.** All detectors and classifiers are total functions that return valid output for all inputs.

**Error model:**
- Invalid input (malformed `RawAudit`) → return empty `ClassifiedAudit` with score 0, hauntings: [], countsByType: {}, detectedCountsByType: {}, needsManualCheck: []
- Missing data (e.g. no `axNodes`) → skip that detector, continue with others
- Unparseable colour strings → skip that text node for Fog detection, continue with others
- CDP errors during collection → recorded in `raw.collectionErrors`, do not propagate to classifier
- `automatedCoverageNote` is always exactly: `"Automated checks find approximately 30-40% of WCAG issues. Manual testing is required for complete coverage."`

**No logging, no I/O.** The classifier is silent. If the input is broken, the output is an empty or partial result — never a thrown exception.

## Testing Strategy

### Unit Tests (Vitest)

**Scope:** Individual detectors, severity assigner, score computer, speech generator, contrast computer.

**Examples:**
- Nameless Spirit detector recognizes all 14 interactive roles
- Hollow Portrait detector skips `alt=""`
- Fog detector computes correct contrast ratios for black-on-white and white-on-black
- Score computer returns 0 for empty input
- Speech generator handles empty names correctly
- Severity assigner recognizes core task flow keywords

**Location:** `packages/core/src/classifier/**/*.test.ts`

**Run command:** `npm test` (Vitest)

### Property-Based Tests (fast-check + Vitest)

**Minimum 100 iterations per property.**

Each test must reference its design property in a comment:
```typescript
// Feature: haunting-classifier, Property 1: Score is deterministic
```

**Property tests cover:**

1. **Score computation invariants** (Requirement 13, Requirement 22)
2. **Contrast computation invariants** (Requirement 18, Requirement 23)
3. **Speech generation invariants** (Requirement 14, Requirement 25)
4. **Detector purity** (Requirement 21, Requirement 26)
5. **Classification totality** (Requirement 24)

**Location:** `packages/core/src/classifier/**/*.test.ts` (same files as unit tests)

### Integration Tests — Golden Test (Vitest, browser-free)

**Scope:** Validate classifier output against `apps/cursed-shop` fixtures.

**Golden test (Vitest, no browser):**
- Location: `packages/core/src/classifier/golden.test.ts`
- Run: `npx vitest --run` in `packages/core`
- For each page (index, product, checkout):
  1. Load `tests/fixtures/raw/<page>.json` and `tests/fixtures/raw/<page>.selectors.json`
  2. Load expected counts from `apps/cursed-shop/expected-hauntings.json[page]`
  3. Call `classify(raw)`
  4. Assert: `detectedCountsByType[type] === golden count` for every type
  5. Assert: for element-level types, the union of `nodeIds[0]` over primary + secondary instances equals the union of the selectors' `self` ids
  6. Assert: CursedLoop matches when every id in its `nodeIds` is in the selector's `subtree` set
  7. Assert: SilentTongue and ShatteredOrder (no-h1/no-main) match by `type + kind + count`; the ShatteredOrder `kinds` multiset equals `kinds` when present
  8. Assert: controls — no `self` id of a control selector appears in any primary or secondary of its guarded types:
     - cookieBanner → CursedLoop
     - decorativeImages → HollowPortrait
     - accessibleCardLinks → LostSoul, NamelessSpirit
     - namedQuickView → NamelessSpirit
     - visibleFocus → InvisibleWanderer
     - decorativeIcons → HollowPortrait, TheVeiled
     - namedSocialLinks → NamelessSpirit
     - hasMain → ShatteredOrder(no-main)
     - hasH1 → ShatteredOrder(no-h1)
     - hasLang → SilentTongue
     - decorativeAltNotHollow → HollowPortrait
     - namedField → WhisperingField
     - properLabels → WhisperingField
     - visibleFocusInTrap → InvisibleWanderer
     - mouseOnlyNativeExits → LostSoul

### Fixture Capture

**Purpose:** Generate `RawAudit` JSON fixtures and selector sidecars for golden tests.

**Process:**
- Runs only after Task 0 (runner changes) and audit-engine runs 19 and 19b have landed
- Script: `packages/core/tests/fixtures/capture.mjs` (ESM JavaScript, no TypeScript syntax, no `__dirname`)
- Run: `npm run capture:fixtures -w @the-unseen/core` (builds first, then runs capture)
- Starts shop via `startShopServer()` from `tests/fixtures/shop-server.ts` (127.0.0.1, random port, closable)
- For each page, calls `auditUrlWithHooks` with `beforeClose` hook (added in Task 0)
- In the **same page session** that produced the RawAudit, resolves every golden selector to `{self: number[], subtree: number[]}` via CDP `DOM.getDocument({depth:-1})` + `DOM.querySelectorAll` + `DOM.describeNode`
- Asserts `collectionErrors.length === 0` and correct `endReason` (index 'body', product 'body', checkout 'trap')
- Writes `tests/fixtures/raw/<page>.json` and `tests/fixtures/raw/<page>.selectors.json` with recursively sorted keys and `screenshotPng: ""`
- In finally: `await getPool().close(); await shop.close()`
- On error: `process.exitCode = 1`

**Script location:** `packages/core/tests/fixtures/capture.mjs`

**Script outline:**
```javascript
import { fileURLToPath } from 'url'
import { auditUrlWithHooks } from '../../dist/audit.js'
import { getPool } from '../../dist/index.js'
import { startShopServer } from './shop-server.ts' // type-stripped

const RAW = fileURLToPath(new URL('./raw/', import.meta.url))
const PAGES = ['index.html', 'product.html', 'checkout.html']

async function capture() {
  const shop = await startShopServer()
  try {
    for (const page of PAGES) {
      const url = `${shop.baseUrl}/${page}`
      const raw = await auditUrlWithHooks(url, { allowPrivate: true }, {
        beforeClose: async (page, raw) => {
          // Resolve selectors while page is open
        }
      })
      // Write raw/<page>.json and raw/<page>.selectors.json
    }
  } finally {
    await getPool().close()
    await shop.close()
  }
}

capture().catch(e => {
  console.error(e)
  process.exitCode = 1
})
```

**Regeneration:** Re-capture whenever `apps/cursed-shop/*.html`, `packages/core/src/runner/**` or `packages/core/src/types.ts` changes, then re-run the golden test.

### Boundary Test

**Purpose:** Enforce that no classifier module imports from `packages/core/src/runner/`.

**Grep-based test:**
```typescript
// packages/core/src/classifier/boundary.test.ts
import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync } from "fs"
import { resolve, relative, dirname } from "path"

describe("Classifier/Runner boundary", () => {
  it("should not import from runner/", () => {
    const classifierDir = resolve(__dirname)
    const files: string[] = []
    
    function walk(dir: string) {
      const entries = readdirSync(dir, { recursive: true })
      for (const entry of entries) {
        const full = resolve(dir, String(entry))
        if (full.endsWith('.ts')) files.push(full)
      }
    }
    
    walk(classifierDir)
    
    for (const file of files) {
      const content = readFileSync(file, "utf-8")
      const matches = [...content.matchAll(/(?:import|export).*from\s+['"]([^'"]+)['"]|(?:import|require)\(['"]([^'"]+)['"]\)/g)]
      
      for (const m of matches) {
        const spec = m[1] || m[2]
        const resolved = resolve(dirname(file), spec)
        const rel = relative(resolve(__dirname, '../..'), resolved)
        expect(rel).not.toMatch(/^src\/runner\//)
      }
    }
  })
})
```

**ESLint flat config (ESLint 9):**
```javascript
// Root eslint.config.js
import tseslint from 'typescript-eslint'

export default tseslint.config({
  files: ['packages/core/src/classifier/**/*.ts'],
  languageOptions: {
    parser: tseslint.parser
  },
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [{
        group: ['**/runner/*', '../runner/*', './runner/*', '**/runner'],
        message: 'classifier must not import runner (structure.md)'
      }]
    }]
  }
})
```

**Root devDependencies:** `eslint@^9`, `typescript-eslint@^8`

**Root script:** `"lint": "eslint packages/core/src/classifier"`

### Test Commands

Use existing `packages/core` scripts:
- `npm run typecheck` — TypeScript type checking
- `npx vitest --run` — Unit and property tests
- `npx playwright test` — Integration tests
- `npm run capture:fixtures` — Fixture capture (added to `packages/core/package.json`)

Root script:
- `npm run lint` — ESLint (added to root `package.json`)

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Score is deterministic

*For any* set of hauntings H, calling `computeScore(H)` multiple times returns the same value every time.

**Validates: Requirements 13.5, 21.5, 22.2**

### Property 2: Score is monotonic non-decreasing

*For any* set of hauntings H and any haunting h, adding h to H never decreases the score: `computeScore(H ∪ {h}) >= computeScore(H)`.

**Validates: Requirements 13.5, 22.4**

### Property 3: Score is order-independent

*For any* permutation of a haunting set H, the score is the same: `computeScore(H) === computeScore(shuffle(H))`.

**Validates: Requirements 13.6, 22.3**

### Property 4: Score is bounded

*For any* set of hauntings H, the score is in the range [0, 100]: `0 <= computeScore(H) <= 100`.

**Validates: Requirements 13.4, 22.5**

### Property 5: Score zero baseline

*For any* empty haunting set, the score is exactly 0: `computeScore([]) === 0`.

**Validates: Requirements 13.3, 22.6**

### Property 6: Score severity-dominance

*For any* set of hauntings H and two hauntings h and h′ where severity(h′) > severity(h), replacing h with h′ never decreases the score: `computeScore(H ∪ {h′}) >= computeScore(H ∪ {h})`.

**Validates: Requirements 13.7, 22.7**

### Property 7: Contrast ratio is symmetric

*For any* two colors c1 and c2, the contrast ratio is symmetric: `contrastRatio(c1, c2) === contrastRatio(c2, c1)`.

**Validates: Requirements 18.4, 23.2**

### Property 8: Contrast ratio is bounded

*For any* two colors c1 and c2, the contrast ratio is in the range [1, 21]: `1 <= contrastRatio(c1, c2) <= 21`.

**Validates: Requirements 18.6, 23.3**

### Property 9: Identical colors have ratio 1

*For any* color c, the contrast ratio with itself is exactly 1: `contrastRatio(c, c) === 1`.

**Validates: Requirements 18.5, 23.4**

### Property 10: Speech always includes role

*For any* AX node with role other than generic/none/presentation, the speech announcement contains the human-readable role label.

**Validates: Requirements 14.3, 25.2**

### Property 11: Speech includes name iff non-empty

*For any* AX node, the speech announcement includes the accessible name if and only if `axNode.name.value.trim().length > 0`.

**Validates: Requirements 14.2, 25.3**

### Property 12: Speech contains no fabricated text

*For any* AX node, the speech announcement never contains 'undefined', 'null', element ids or HTML. Apart from the steering special rows ("<roleLabel>, blank", "unlabelled graphic", "unlabelled graphic, <filename>"), it contains only name, role and state. speechNote and soundCue text never appear in speech.

**Validates: Requirements 14.8, 25.4**

### Property 13: Generic nodes are skipped

*For any* AX node with role generic/none/presentation, the speech announcement is an empty string.

**Validates: Requirements 14.5, (generic exception in 25.2)**

### Property 14: Detector purity

*For any* detector and any `RawAudit` input, calling the detector twice with the same input returns the same output.

**Validates: Requirements 21.1, 21.5, 26.2**

### Property 15: Detector does not mutate input

*For any* detector and any `RawAudit` input, the input is unchanged after the detector returns.

**Validates: Requirements 21.4, 26.4**

### Property 16: Every axe violation is accounted for

*For any* `RawAudit` with axe violations, every axe violation either maps to a primary haunting or appears in the unmapped list — no violation is lost.

**Validates: Requirements 16.2, 24.2, 24.3**

### Property 17: Primary haunting uniqueness

*For any* classified audit, no backendDOMNodeId appears in the nodeIds of two primary hauntings that take part in precedence. SilentTongue and ShatteredOrder are excluded: they are always primary and may share html/body.

**Validates: Requirements 15.1**

### Property 18: Score counts only primary hauntings

*For any* classified audit, the score is computed only from hauntings where `isPrimary: true`.

**Validates: Requirements 15.4**

### Property 19: Luminance monotonicity

*For any* colour c and any channel, increasing that channel never decreases `relativeLuminance(c)`. For a fixed darker colour, `contrastRatio` is non-decreasing as the lighter colour's luminance increases.

**Validates: Requirements 23.5**

## Appendix: WCAG Criterion Definitions

```typescript
// packages/core/src/classifier/wcag.ts

export const WCAG_1_1_1: WCAGCriterion = {
  id: "1.1.1",
  level: "A",
  title: "Non-text Content",
  url: "https://www.w3.org/WAI/WCAG22/Understanding/non-text-content",
}

export const WCAG_1_3_1: WCAGCriterion = {
  id: "1.3.1",
  level: "A",
  title: "Info and Relationships",
  url: "https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships",
}

export const WCAG_1_4_3: WCAGCriterion = {
  id: "1.4.3",
  level: "AA",
  title: "Contrast (Minimum)",
  url: "https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum",
}

export const WCAG_2_1_1: WCAGCriterion = {
  id: "2.1.1",
  level: "A",
  title: "Keyboard",
  url: "https://www.w3.org/WAI/WCAG22/Understanding/keyboard",
}

export const WCAG_2_1_2: WCAGCriterion = {
  id: "2.1.2",
  level: "A",
  title: "No Keyboard Trap",
  url: "https://www.w3.org/WAI/WCAG22/Understanding/no-keyboard-trap",
}

export const WCAG_2_4_4: WCAGCriterion = {
  id: "2.4.4",
  level: "A",
  title: "Link Purpose (In Context)",
  url: "https://www.w3.org/WAI/WCAG22/Understanding/link-purpose-in-context",
}

export const WCAG_2_4_6: WCAGCriterion = {
  id: "2.4.6",
  level: "AA",
  title: "Headings and Labels",
  url: "https://www.w3.org/WAI/WCAG22/Understanding/headings-and-labels",
}

export const WCAG_2_4_7: WCAGCriterion = {
  id: "2.4.7",
  level: "AA",
  title: "Focus Visible",
  url: "https://www.w3.org/WAI/WCAG22/Understanding/focus-visible",
}

export const WCAG_2_4_13: WCAGCriterion = {
  id: "2.4.13",
  level: "AAA",
  title: "Focus Appearance",
  url: "https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance",
}

export const WCAG_3_1_1: WCAGCriterion = {
  id: "3.1.1",
  level: "A",
  title: "Language of Page",
  url: "https://www.w3.org/WAI/WCAG22/Understanding/language-of-page",
}

export const WCAG_3_3_2: WCAGCriterion = {
  id: "3.3.2",
  level: "A",
  title: "Labels or Instructions",
  url: "https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions",
}

export const WCAG_4_1_2: WCAGCriterion = {
  id: "4.1.2",
  level: "A",
  title: "Name, Role, Value",
  url: "https://www.w3.org/WAI/WCAG22/Understanding/name-role-value",
}
```
