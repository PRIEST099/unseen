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
  │     └─→ UnclassifiedHaunting[] (no severity yet)
  │
  ├─→ Precedence resolver
  │     │
  │     └─→ Primary + secondary hauntings (one primary per element max)
  │
  ├─→ Severity assigner
  │     │
  │     └─→ Haunting[] (with Wraith/Restless/Banished)
  │
  ├─→ Explanation generator
  │     │
  │     └─→ Haunting[] (with explanation, persona, fix)
  │
  ├─→ Score computer
  │     │
  │     └─→ number (0-100 Haunting Score)
  │
  ├─→ Axe cross-checker
  │     │
  │     └─→ AxeCrossCheck (map hauntings ↔ axe violations)
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
  wcag: WCAGCriterion // primary criterion
  wcagAlso?: WCAGCriterion[] // additional criteria
  guidance?: string // e.g. "2.4.13" for Invisible Wanderer
  nodeIds: number[] // backendDOMNodeId for affected elements
  box: BoundingBox | null // primary element's box; null for page-level hauntings
  speech?: string // screen-reader announcement for this element
  speechNote?: string // e.g. "name disappears when typing"
  soundCue?: string // e.g. "garbled-whisper", "chime"
  htmlSnippet: string // ≤ 300 chars; outerHTML of the primary element
  explanation: string // what is wrong (1-2 sentences)
  persona: string // who is affected (1 sentence starting with "As a")
  fix: HauntingFix
  isPrimary: boolean // true for primary hauntings (scored); false for secondary
  secondary?: Haunting[] // lower-precedence hauntings on the same element
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

export type UnclassifiedHaunting = Omit<Haunting, "severity" | "isPrimary">

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
- `axeViolations` — axe-core results
- `textNodeStyles` — contrast data
- `eventListenerSignals` — click handlers
- `tabWalkResult` — Tab walk steps and cycles
- `pageMetadata` — lang, headings, landmarks
- `domAxMapping` — DOM-to-AX presence mapping
- `imgAltAttributes` — alt attribute values
- `boundingBoxes` — element positions

**Output:** `UnclassifiedHaunting[]`. Each has `type`, `wcag`, `nodeIds`, `box`, `speech`, `htmlSnippet`, `explanation`, `persona`, and `fix`, but **not** `severity` or `isPrimary` (those are assigned later).

### Precedence Model

When multiple detection rules match the same element (by `backendDOMNodeId`), assign exactly one **primary haunting** and mark the others as **secondary**. Only primary hauntings are scored.

**Precedence order (highest to lowest):**
1. Cursed Loop
2. Nameless Spirit
3. Whispering Field
4. Lost Soul
5. Hollow Portrait
6. The Veiled
7. Invisible Wanderer
8. The Fog

**Precedence key:** The `backendDOMNodeId` used for precedence grouping. For Cursed Loop it is `trapRegionNodeIds[0]` (the trap region: dialog or common ancestor). Cycle members go in `nodeIds` after it but do not take part in precedence. For all other types it is `nodeIds[0]`. Each precedence key has at most one primary haunting.

**Algorithm:**
1. Group all hauntings by their precedence key (nodeIds[0] for most types, trapRegionNodeIds[0] for Cursed Loop).
2. For each group, sort by precedence order.
3. Mark the first haunting `isPrimary: true`, attach the rest as `secondary: Haunting[]`.
4. Return the full set (primary + secondary).

**Edge case:** page-level hauntings (Silent Tongue, Shattered Order with `kind: "no-h1"` or `"no-main"`) have `nodeIds: []` and cannot collide. They are always primary.

**Note:** A Cursed Loop member that is also a Whispering Field keeps the Whispering Field as a secondary of the loop, because the loop's precedence key is the region, not the cycle members.

### Severity Assignment

Apply these rules in order (first match wins):

1. **Wraith** — the haunting affects a core task flow element AND makes the task impossible for AT users.
2. **Restless** — the haunting affects ≥3 elements of the same type, OR the WCAG criterion is level A.
3. **Banished** — all other hauntings.

**Core task flow detection:**
- Element is inside a `<form>` (check DOM ancestor chain via `backendDOMNodeId` lookup), OR
- Element has role `button` or `link`, AND the accessible name contains one of these keywords (case-insensitive): "submit", "checkout", "buy", "pay", "login", "sign in", "sign up", "search", "continue", "cart", "add to", "basket", "register", "subscribe".

**Input:** `UnclassifiedHaunting[]` + `RawAudit` (for DOM/AX traversal to check `<form>` ancestors and accessible names).

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

**Special cases:**
- `role: "heading"` → append " level N" where N is from `aria-level` property or inferred from tag name
- `role: "generic"`, `"none"`, `"presentation"` → return empty string (do not announce)
- Empty name + interactive role → haunting (#1 or #7), but still announce the role

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

**Input:** `AXNode` from the `RawAudit`.

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
    const role = node.role.value as string
    const name = (node.name.value as string || "").trim()
    
    if (interactiveRoles.has(role) && name === "") {
      hauntings.push({
        id: generateId("NamelessSpirit", node.backendDOMNodeId),
        type: "NamelessSpirit",
        wcag: WCAG_4_1_2, // also 2.4.4, 1.1.1 for image buttons
        nodeIds: [node.backendDOMNodeId],
        box: findBox(raw.boundingBoxes, node.backendDOMNodeId),
        speech: generateSpeech(node), // will be just the role
        htmlSnippet: extractSnippet(raw, node.backendDOMNodeId),
        explanation: `Interactive element has no accessible name. Screen readers announce only "${ROLE_LABEL_MAP[role] || role}", leaving users unable to identify its purpose.`,
        persona: "As a screen-reader user, I cannot determine what this control does.",
        fix: generateNamelessSpiritFix(node),
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
- `aria-hidden="true"` (unless sole content of button/link — that's a Nameless Spirit instead)
- Inline SVG without explicit `role="img"` (unless sole content of button/link)

**Algorithm:**
```typescript
function detectHollowPortrait(raw: RawAudit): UnclassifiedHaunting[] {
  const hauntings: UnclassifiedHaunting[] = []
  
  for (const node of raw.axNodes) {
    if (node.ignored) continue
    const role = node.role.value as string
    
    // Treat "img" and "image" as equivalent
    if (role !== "img" && role !== "image") continue
    
    const name = (node.name.value as string || "").trim()
    if (name !== "") continue // has a name, not hollow
    
    // Check if alt="" (intentionally decorative)
    const altAttr = raw.imgAltAttributes[node.backendDOMNodeId.toString()]
    if (altAttr === "") continue // correctly decorative
    
    // Check if role="presentation" or "none" (correctly decorative)
    const explicitRole = getExplicitRole(raw, node.backendDOMNodeId)
    if (explicitRole === "presentation" || explicitRole === "none") continue
    
    hauntings.push({
      id: generateId("HollowPortrait", node.backendDOMNodeId),
      type: "HollowPortrait",
      wcag: WCAG_1_1_1,
      nodeIds: [node.backendDOMNodeId],
      box: findBox(raw.boundingBoxes, node.backendDOMNodeId),
      speech: generateHollowPortraitSpeech(node, raw), // "unlabelled graphic, [filename]"
      htmlSnippet: extractSnippet(raw, node.backendDOMNodeId),
      explanation: "Image has no text alternative. Screen-reader users miss the visual information.",
      persona: "As a screen-reader user, I cannot see the image and have no description.",
      fix: generateHollowPortraitFix(node),
    })
  }
  
  return hauntings
}
```

**Speech generation:** `"unlabelled graphic, [filename]"` where filename is extracted from the `src` attribute (last path segment, no query string).

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
    
    // Parse colors
    const fg = parseColor(style.color)
    const bg = parseColor(style.backgroundColor)
    if (!fg || !bg) continue
    
    const ratio = contrastRatio(fg, bg)
    const threshold = style.isLargeText ? 3.0 : 4.5
    
    if (ratio < threshold) {
      const nodeId = parseInt(nodeIdStr, 10)
      hauntings.push({
        id: generateId("TheFog", nodeId),
        type: "TheFog",
        wcag: WCAG_1_4_3,
        nodeIds: [nodeId],
        box: findBox(raw.boundingBoxes, nodeId),
        speech: undefined, // no speech for Fog
        htmlSnippet: extractSnippet(raw, nodeId),
        explanation: `Text contrast is ${ratio.toFixed(2)}:1, below the required ${threshold}:1. Low-vision users struggle to read it.`,
        persona: "As a low-vision user, I strain to read this text.",
        fix: generateFogFix(ratio, threshold),
      })
    }
  }
  
  return hauntings
}
```

**WCAG mapping:** 1.4.3 (Contrast Minimum).

### 4. Lost Soul

**Rule:** Element has a click handler AND is not in Tab walk AND does not have an interactive ARIA role AND is not a native interactive element.

**Native interactive elements:** `<button>`, `<a href>`, `<input>`, `<select>`, `<textarea>`, `<summary>`, `[contenteditable]`.

**Outermost rule:** Report only the outermost qualifying element. If a child and ancestor both match, report the ancestor.

**Skip rule:** Skip elements inside or containing native interactive elements.

**Algorithm:**
```typescript
function detectLostSoul(raw: RawAudit): UnclassifiedHaunting[] {
  const hauntings: UnclassifiedHaunting[] = []
  const tabWalkNodeIds = new Set(raw.tabWalkResult.steps.map(s => parseInt(s.backendDOMNodeId, 10)))
  const interactiveRoles = new Set([...INTERACTIVE_ROLES])
  
  // Build candidate set: elements with click handlers
  const candidates = raw.eventListenerSignals.filter(sig =>
    sig.eventTypes.some(t => ["click", "mousedown", "pointerdown", "pointerup"].includes(t))
  )
  
  // Filter: not in Tab walk, not native interactive, not interactive ARIA role
  const qualifying = candidates.filter(sig => {
    // In Tab walk? Skip.
    if (tabWalkNodeIds.has(sig.backendDOMNodeId)) return false
    
    // Native interactive element? Skip.
    const tagLower = sig.tagName.toLowerCase()
    if (["button", "a", "input", "select", "textarea", "summary"].includes(tagLower)) return false
    // Check for <a href> specifically (axNode will have link role)
    
    // Check AX role
    const axNode = findAXNode(raw, sig.backendDOMNodeId)
    if (!axNode) return false
    if (interactiveRoles.has(axNode.role.value as string)) return false
    
    // Inside or contains native interactive? Skip.
    if (isInsideInteractive(raw, sig.backendDOMNodeId)) return false
    if (containsInteractive(raw, sig.backendDOMNodeId)) return false
    
    return true
  })
  
  // Apply outermost rule: sort by DOM depth, keep only ancestors
  const outermost = filterOutermost(raw, qualifying.map(s => s.backendDOMNodeId))
  
  for (const nodeId of outermost) {
    hauntings.push({
      id: generateId("LostSoul", nodeId),
      type: "LostSoul",
      wcag: WCAG_2_1_1, // also 4.1.2
      nodeIds: [nodeId],
      box: findBox(raw.boundingBoxes, nodeId),
      speech: undefined, // no speech for Lost Soul
      htmlSnippet: extractSnippet(raw, nodeId),
      explanation: "Element responds to clicks but is not keyboard-accessible. Keyboard users cannot interact with it.",
      persona: "As a keyboard user, I cannot reach this control.",
      fix: generateLostSoulFix(),
    })
  }
  
  return hauntings
}
```

**WCAG mapping:** 2.1.1 (Keyboard), 4.1.2 (Name, Role, Value).

### 5. Cursed Loop

**Rule:** Tab walk visits a cycle before all focusables are visited AND escape test (Escape then Shift+Tab) fails.

**Data source:** `raw.tabWalkResult.cycles` already includes escape-test results.

**Algorithm:**
```typescript
function detectCursedLoop(raw: RawAudit): UnclassifiedHaunting[] {
  const hauntings: UnclassifiedHaunting[] = []
  
  for (const cycle of raw.tabWalkResult.cycles) {
    // Skip escapable cycles
    if (cycle.escapable) continue
    
    // Skip cycles that include all focusables (intentional roving tabindex)
    if (cycle.includesAllFocusables) continue
    
    // This is a trap
    hauntings.push({
      id: generateId("CursedLoop", cycle.nodeIds[0]), // use first node ID
      type: "CursedLoop",
      wcag: WCAG_2_1_2,
      nodeIds: cycle.nodeIds.map(id => parseInt(id, 10)),
      box: findBox(raw.boundingBoxes, parseInt(cycle.nodeIds[0], 10)),
      speech: undefined, // no speech for Cursed Loop
      htmlSnippet: extractSnippet(raw, parseInt(cycle.nodeIds[0], 10)),
      explanation: `Keyboard trap detected. Focus cycles through ${cycle.nodeIds.length} elements with no escape. Keyboard users are stuck.`,
      persona: "As a keyboard user, I am trapped and cannot navigate to the rest of the page.",
      fix: generateCursedLoopFix(),
    })
  }
  
  return hauntings
}
```

**WCAG mapping:** 2.1.2 (No Keyboard Trap).

### 6. Invisible Wanderer

**Rule:** Element is in Tab walk AND focus indicator is not visible.

**Visibility criteria:** At least one of:
- (a) `outline-style` ≠ `none` AND `outline-width` ≥ 1px AND outline colour contrast ≥ 3:1
- (b) `box-shadow` changed with contrast ≥ 3:1
- (c) `border-color` or `background-color` changed with Δ contrast ≥ 3:1
- (d) `text-decoration` changed

**Chromium quirk:** Ignore `outline-offset`, `outline-width`, `outline-color` deltas when `outline-style` is `none`.

**Algorithm:**
```typescript
function detectInvisibleWanderer(raw: RawAudit): UnclassifiedHaunting[] {
  const hauntings: UnclassifiedHaunting[] = []
  
  for (const step of raw.tabWalkResult.steps) {
    const { before, after } = step.focusSnapshot
    
    // Check visibility criteria
    const hasVisibleIndicator = (
      hasVisibleOutline(before, after) ||
      hasVisibleBoxShadow(before, after) ||
      hasVisibleColorChange(before, after) ||
      hasTextDecorationChange(before, after)
    )
    
    if (!hasVisibleIndicator) {
      const nodeId = parseInt(step.backendDOMNodeId, 10)
      hauntings.push({
        id: generateId("InvisibleWanderer", nodeId),
        type: "InvisibleWanderer",
        wcag: WCAG_2_4_7,
        nodeIds: [nodeId],
        box: findBox(raw.boundingBoxes, nodeId),
        speech: undefined, // no speech for Invisible Wanderer
        htmlSnippet: extractSnippet(raw, nodeId),
        explanation: "Element has no visible focus indicator. Keyboard users lose track of their position.",
        persona: "As a keyboard user, I cannot see which element has focus.",
        fix: generateInvisibleWandererFix(),
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
  
  const outlineColor = parseColor(after["outline-color"])
  const bgColor = parseColor(after["background-color"]) // adjacent background (simplification)
  if (!outlineColor || !bgColor) return false
  
  const contrast = contrastRatio(outlineColor, bgColor)
  return contrast >= 3.0
}

function hasVisibleBoxShadow(before: ComputedStyleMap, after: ComputedStyleMap): boolean {
  if (before["box-shadow"] === after["box-shadow"]) return false
  // Parse box-shadow, extract colour, check contrast ≥ 3:1
  // (Implementation detail: parse box-shadow string, extract RGBA, compare)
  return false // placeholder
}

function hasVisibleColorChange(before: ComputedStyleMap, after: ComputedStyleMap): boolean {
  const beforeBg = parseColor(before["background-color"])
  const afterBg = parseColor(after["background-color"])
  if (beforeBg && afterBg) {
    const contrast = contrastRatio(beforeBg, afterBg)
    if (contrast >= 3.0) return true
  }
  
  const beforeBorder = parseColor(before["border-color"])
  const afterBorder = parseColor(after["border-color"])
  if (beforeBorder && afterBorder) {
    const contrast = contrastRatio(beforeBorder, afterBorder)
    if (contrast >= 3.0) return true
  }
  
  return false
}

function hasTextDecorationChange(before: ComputedStyleMap, after: ComputedStyleMap): boolean {
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
  
  for (const node of raw.axNodes) {
    if (node.ignored) continue
    const role = node.role.value as string
    if (!formRoles.has(role)) continue
    
    const name = (node.name.value as string || "").trim()
    
    // Case (a): empty name
    if (name === "") {
      hauntings.push({
        id: generateId("WhisperingField", node.backendDOMNodeId),
        type: "WhisperingField",
        wcag: WCAG_1_3_1, // also 3.3.2, 4.1.2
        nodeIds: [node.backendDOMNodeId],
        box: findBox(raw.boundingBoxes, node.backendDOMNodeId),
        speech: `${ROLE_LABEL_MAP[role]}, blank`,
        htmlSnippet: extractSnippet(raw, node.backendDOMNodeId),
        explanation: "Form field has no accessible label. Screen-reader users do not know what to enter.",
        persona: "As a screen-reader user, I do not know what this field is for.",
        fix: generateWhisperingFieldFix("empty"),
      })
      continue
    }
    
    // Case (b): placeholder-only name
    const sources = node.name.sources || []
    const winningSource = sources.find(s => !s.superseded)
    if (winningSource && winningSource.type === "placeholder") {
      hauntings.push({
        id: generateId("WhisperingField", node.backendDOMNodeId),
        type: "WhisperingField",
        wcag: WCAG_1_3_1,
        nodeIds: [node.backendDOMNodeId],
        box: findBox(raw.boundingBoxes, node.backendDOMNodeId),
        speech: `${name}, ${ROLE_LABEL_MAP[role]}`, // + UI note
        htmlSnippet: extractSnippet(raw, node.backendDOMNodeId),
        explanation: `Form field uses placeholder as label. The placeholder text "${name}" disappears when the user types, causing confusion.`,
        persona: "As a screen-reader user, I lose the field label as soon as I start typing.",
        fix: generateWhisperingFieldFix("placeholder"),
      })
    }
  }
  
  return hauntings
}
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
  
  if (!lang) {
    hauntings.push({
      id: generateId("SilentTongue", 0), // page-level, no nodeId
      type: "SilentTongue",
      wcag: WCAG_3_1_1,
      nodeIds: [],
      box: null,
      speech: undefined,
      soundCue: "garbled-whisper", // audio cue, not spoken text
      htmlSnippet: "<html>",
      explanation: "Page has no language declaration. Screen readers cannot choose the correct pronunciation rules.",
      persona: "As a screen-reader user, I hear incorrect pronunciation.",
      fix: generateSilentTongueFix(),
    })
    return hauntings
  }
  
  const bcp47Regex = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/
  if (!bcp47Regex.test(lang)) {
    hauntings.push({
      id: generateId("SilentTongue", 0),
      type: "SilentTongue",
      wcag: WCAG_3_1_1,
      nodeIds: [],
      box: null,
      speech: undefined,
      soundCue: "garbled-whisper",
      htmlSnippet: `<html lang="${lang}">`,
      explanation: `Language attribute "${lang}" is not a valid BCP 47 tag. Screen readers cannot interpret it.`,
      persona: "As a screen-reader user, I hear incorrect pronunciation.",
      fix: generateSilentTongueFix(),
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
  const { headings, hasMainLandmark } = raw.pageMetadata
  
  // Check (a): no h1
  const hasH1 = headings.some(h => h.tagName === "h1")
  if (!hasH1) {
    hauntings.push({
      id: generateId("ShatteredOrder", 0, "no-h1"),
      type: "ShatteredOrder",
      kind: "no-h1",
      wcag: WCAG_1_3_1, // also 2.4.6
      nodeIds: [],
      box: null,
      speech: undefined,
      htmlSnippet: "",
      explanation: "Page has no main heading (h1). Screen-reader users cannot quickly identify the page purpose.",
      persona: "As a screen-reader user, I do not know what this page is about.",
      fix: generateShatteredOrderFix("no-h1"),
    })
  }
  
  // Check (b): heading skips
  const levels = headings.map(h => parseInt(h.tagName.slice(1), 10))
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] - levels[i - 1] > 1) {
      hauntings.push({
        id: generateId("ShatteredOrder", i, "heading-skip"),
        type: "ShatteredOrder",
        kind: "heading-skip",
        wcag: WCAG_1_3_1,
        nodeIds: [],
        box: null,
        speech: undefined,
        htmlSnippet: `<h${levels[i - 1]}> → <h${levels[i]}>`,
        explanation: `Heading levels skip from h${levels[i - 1]} to h${levels[i]}. Screen-reader users expect a logical hierarchy.`,
        persona: "As a screen-reader user, I am confused by the document structure.",
        fix: generateShatteredOrderFix("heading-skip"),
      })
    }
  }
  
  // Check (c): no main landmark
  if (!hasMainLandmark) {
    hauntings.push({
      id: generateId("ShatteredOrder", 0, "no-main"),
      type: "ShatteredOrder",
      kind: "no-main",
      wcag: WCAG_1_3_1,
      nodeIds: [],
      box: null,
      speech: undefined,
      htmlSnippet: "",
      explanation: "Page has no main landmark. Screen-reader users cannot quickly jump to the main content.",
      persona: "As a screen-reader user, I cannot skip navigation and jump to content.",
      fix: generateShatteredOrderFix("no-main"),
    })
  }
  
  return hauntings
}
```

**WCAG mapping:** 1.3.1 (Info and Relationships), 2.4.6 (Headings and Labels).

### 10. The Veiled

**Rule:** Focusable inside `aria-hidden="true"` OR visible content excluded from AX tree.

**Visibility check:** Non-zero bounding box, not `display:none` / `visibility:hidden`, `opacity > 0`, intersects scrollable area.

**Exclusions:** Purely decorative (`<img alt="">`, `role="presentation"`/`"none"` with no text/focusable children).

**Algorithm:**
```typescript
function detectTheVeiled(raw: RawAudit): UnclassifiedHaunting[] {
  const hauntings: UnclassifiedHaunting[] = []
  
  for (const mapping of raw.domAxMapping) {
    // Case (a): focusable inside aria-hidden
    if (mapping.ariaHidden && mapping.isFocusable) {
      hauntings.push({
        id: generateId("TheVeiled", mapping.backendDOMNodeId),
        type: "TheVeiled",
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
        wcag: WCAG_1_3_1,
        nodeIds: [mapping.backendDOMNodeId],
        box: findBox(raw.boundingBoxes, mapping.backendDOMNodeId),
        speech: undefined,
        htmlSnippet: extractSnippet(raw, mapping.backendDOMNodeId),
        explanation: "Visible content is hidden from assistive technology. Screen-reader users miss important information.",
        persona: "As a screen-reader user, I do not know this content exists.",
        fix: generateVeiledFix("content-hidden"),
      })
    }
  }
  
  return hauntings
}
```

**WCAG mapping:** 1.3.1 (Info and Relationships), 4.1.2 (Name, Role, Value).

## Error Handling

**Pure functions throw no exceptions.** All detectors and classifiers are total functions that return valid output for all inputs.

**Error model:**
- Invalid input (malformed `RawAudit`) → return empty `ClassifiedAudit` with score 0 and an error note in `automatedCoverageNote`.
- Missing data (e.g. no `axNodes`) → skip that detector, continue with others.
- Unparseable colour strings → skip that text node for Fog detection, continue with others.
- CDP errors during collection → recorded in `raw.collectionErrors`, do not propagate to classifier.

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

### Integration Tests (Playwright Test)

**Scope:** End-to-end classification against `apps/cursed-shop` fixtures.

**Golden test:**
1. Load `RawAudit` from `packages/core/tests/fixtures/raw/index.json`
2. Call `classify(raw)`
3. Assert `countsByType` matches `apps/cursed-shop/expected-hauntings.json` exactly
4. Assert node IDs (resolved from selectors) match
5. Repeat for `product.json` and `checkout.json`

**Location:** `packages/core/tests/classify.int.spec.ts`

**Run command:** `npm run test:integration` (Playwright Test)

### Fixture Capture

**Purpose:** Generate `RawAudit` JSON fixtures for golden tests without running a browser in CI.

**Process:**
1. Start `apps/cursed-shop` with `npm start` (serves on `http://localhost:3000`)
2. Run fixture capturer: `npm run capture-fixtures` (calls `auditUrl` for each page)
3. Write `RawAudit` to `packages/core/tests/fixtures/raw/{page}.json`
4. Commit fixtures to git

**Script location:** `packages/core/tests/fixtures/capture.ts`

**Script:**
```typescript
import { auditUrl } from "../../src/index.js"
import { writeFileSync } from "fs"
import { resolve } from "path"

const BASE = "http://localhost:3000"
const PAGES = ["index.html", "product.html", "checkout.html"]

async function captureFixtures() {
  for (const page of PAGES) {
    const url = `${BASE}/${page}`
    console.log(`Capturing ${url}...`)
    const raw = await auditUrl(url, { allowPrivate: true })
    const filename = page.replace(".html", ".json")
    const path = resolve(__dirname, "raw", filename)
    writeFileSync(path, JSON.stringify(raw, null, 2))
    console.log(`Wrote ${path}`)
  }
}

captureFixtures().catch(console.error)
```

**Regeneration:** Re-run when `apps/cursed-shop` HTML changes or new haunting types are added.

### Boundary Test

**Purpose:** Enforce that no classifier module imports from `packages/core/src/runner/`.

**Implementation:**
```typescript
// packages/core/src/classifier/boundary.test.ts
import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync } from "fs"
import { resolve, join } from "path"

describe("Classifier/Runner boundary", () => {
  it("should not import from runner/", () => {
    const classifierDir = resolve(__dirname)
    const files = readdirSync(classifierDir, { recursive: true, withFileTypes: true })
      .filter(d => d.isFile() && d.name.endsWith(".ts"))
      .map(d => join(d.path, d.name))
    
    for (const file of files) {
      const content = readFileSync(file, "utf-8")
      const importMatches = content.match(/import .* from ['"](.*)['"];?/g) || []
      for (const imp of importMatches) {
        expect(imp).not.toMatch(/runner\//)
      }
    }
  })
})
```

**ESLint rule:**
```json
{
  "overrides": [
    {
      "files": ["packages/core/src/classifier/**/*.ts"],
      "rules": {
        "no-restricted-imports": [
          "error",
          {
            "patterns": ["**/runner/**"]
          }
        ]
      }
    }
  ]
}
```

### Test Commands

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:integration": "playwright test",
    "capture-fixtures": "tsx tests/fixtures/capture.ts"
  }
}
```

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

**Validates: Requirements 14.3, 25.3**

### Property 11: Speech includes name iff non-empty

*For any* AX node, the speech announcement includes the accessible name if and only if `axNode.name.value.trim().length > 0`.

**Validates: Requirements 14.2, 25.2**

### Property 12: Speech contains no fabricated text

*For any* AX node, the speech announcement contains only the name, role, and state — no "undefined", "null", or fabricated text.

**Validates: Requirements 14.8, 25.3**

### Property 13: Generic nodes are skipped

*For any* AX node with role generic/none/presentation, the speech announcement is an empty string.

**Validates: Requirements 14.5, 25.4**

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

*For any* classified audit, each element has at most one primary haunting (by `backendDOMNodeId`).

**Validates: Requirements 15.1**

### Property 18: Score counts only primary hauntings

*For any* classified audit, the score is computed only from hauntings where `isPrimary: true`.

**Validates: Requirements 15.4**

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
