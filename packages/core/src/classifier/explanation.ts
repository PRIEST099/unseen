import type { HauntingFix, HauntingType } from './types.js'
import { ROLE_LABEL_MAP } from './speech.js'

/** What the explanation and fix text can mention. Every field is optional. */
export type ExplanationContext = {
  role?: string // AX role of the element
  ratio?: number // measured contrast ratio
  threshold?: number // required contrast ratio
  kind?: string // ShatteredOrder kind
  lang?: string | null // the page's lang attribute
  fieldCase?: 'empty' | 'placeholder' // WhisperingField case
  placeholder?: string // the placeholder text that names the field
  fromLevel?: number // heading level before a skip
  toLevel?: number // heading level after a skip
  trapSize?: number // number of elements in a keyboard trap
  focusable?: boolean // The Veiled: a focusable element is hidden
}

export type FixContext = ExplanationContext

const labelOf = (role: string | undefined): string => (role === undefined ? 'control' : (ROLE_LABEL_MAP[role] ?? role))

function shatteredExplanation(ctx: ExplanationContext): string {
  if (ctx.kind === 'no-h1') return 'Page has no main heading (h1). Screen-reader users cannot quickly identify the page purpose.'
  if (ctx.kind === 'no-main') return 'Page has no main landmark. Screen-reader users cannot quickly jump to the main content.'
  const from = ctx.fromLevel === undefined ? '' : ` from h${ctx.fromLevel}`
  const to = ctx.toLevel === undefined ? '' : ` to h${ctx.toLevel}`
  return `Heading levels skip${from}${to}. Screen-reader users expect a logical hierarchy.`
}

function whisperingExplanation(ctx: ExplanationContext): string {
  if (ctx.fieldCase === 'placeholder') {
    const text = ctx.placeholder === undefined ? 'The placeholder text' : `The placeholder text "${ctx.placeholder}"`
    return `Form field uses its placeholder as its label. ${text} disappears when the user types.`
  }
  return 'Form field has no accessible label. Screen-reader users do not know what to enter.'
}

function silentExplanation(ctx: ExplanationContext): string {
  if (ctx.lang === undefined || ctx.lang === null || ctx.lang === '') {
    return 'Page has no language declaration. Screen readers cannot choose the correct pronunciation rules.'
  }
  return `Language attribute "${ctx.lang}" is not a valid BCP 47 tag. Screen readers cannot interpret it.`
}

/** One or two sentences describing what is wrong. */
export function generateExplanation(type: HauntingType, context: ExplanationContext = {}): string {
  switch (type) {
    case 'NamelessSpirit':
      return `Interactive element has no accessible name. Screen readers announce only "${labelOf(context.role)}", leaving users unable to identify its purpose.`
    case 'HollowPortrait':
      return 'Image has no text alternative. Screen-reader users miss the visual information.'
    case 'TheFog': {
      const ratio = context.ratio === undefined ? '' : ` is ${context.ratio.toFixed(2)}:1`
      const need = context.threshold === undefined ? '' : `, below the required ${context.threshold}:1`
      return `Text contrast${ratio}${need}. Low-vision users struggle to read it.`
    }
    case 'LostSoul':
      return 'Element responds to clicks but is not keyboard-accessible. Keyboard users cannot interact with it.'
    case 'CursedLoop': {
      const size = context.trapSize === undefined ? '' : ` through ${context.trapSize} elements`
      return `Keyboard trap: focus cycles${size} with no way out using Escape or Shift+Tab.`
    }
    case 'InvisibleWanderer':
      return 'Element has no visible focus indicator. Keyboard users lose track of their position.'
    case 'WhisperingField':
      return whisperingExplanation(context)
    case 'SilentTongue':
      return silentExplanation(context)
    case 'ShatteredOrder':
      return shatteredExplanation(context)
    case 'TheVeiled':
      return context.focusable === true
        ? 'Focusable content is hidden from assistive technology with aria-hidden or a presentational role. Keyboard users can reach it, but screen readers announce nothing.'
        : 'Visible content is hidden from assistive technology. Screen-reader users miss important information.'
  }
}

/** One sentence starting with "As a". */
export function generatePersona(type: HauntingType): string {
  switch (type) {
    case 'NamelessSpirit':
      return 'As a screen-reader user, I cannot tell what this control does.'
    case 'HollowPortrait':
      return 'As a screen-reader user, I cannot see this image and have no description of it.'
    case 'TheFog':
      return 'As a low-vision user, I strain to read this text.'
    case 'LostSoul':
      return 'As a keyboard user, I cannot reach or activate this control.'
    case 'CursedLoop':
      return 'As a keyboard user, I am trapped and cannot move on to the rest of the page.'
    case 'InvisibleWanderer':
      return 'As a keyboard user, I cannot see which element has focus.'
    case 'WhisperingField':
      return 'As a screen-reader user, I do not know what this field is for.'
    case 'SilentTongue':
      return 'As a screen-reader user, I hear text read with the wrong pronunciation.'
    case 'ShatteredOrder':
      return 'As a screen-reader user, I cannot navigate this page by its structure.'
    case 'TheVeiled':
      return 'As a screen-reader user, I do not know this content exists.'
  }
}

function nameless(ctx: FixContext): HauntingFix {
  const role = ctx.role ?? 'button'
  if (role === 'link') {
    return {
      instruction: 'Give the link an accessible name: visible text, or an aria-label when it only shows an icon.',
      codeSnippet: '<a href="/page" aria-label="Descriptive link name">…</a>',
    }
  }
  return {
    instruction: 'Give the control an accessible name: visible text, or an aria-label when it only shows an icon.',
    codeSnippet: '<button type="button" aria-label="Describe the action">…</button>',
  }
}

function whispering(ctx: FixContext): HauntingFix {
  const instruction =
    ctx.fieldCase === 'placeholder'
      ? 'Add a visible <label> tied to the field. Keep the placeholder only as an example value.'
      : 'Add a visible <label> tied to the field, or an aria-label when no visible label fits.'
  return { instruction, codeSnippet: '<label for="email">Email address</label>\n<input id="email" type="email" autocomplete="email">' }
}

function shattered(ctx: FixContext): HauntingFix {
  if (ctx.kind === 'no-h1') {
    return { instruction: 'Add one h1 that names the page.', codeSnippet: '<h1>Page title</h1>' }
  }
  if (ctx.kind === 'no-main') {
    return { instruction: 'Wrap the primary content in a main landmark.', codeSnippet: '<main id="main">…</main>' }
  }
  return {
    instruction: 'Use heading levels in order. Do not skip a level; pick the level by structure, then style it with CSS.',
    codeSnippet: '<h2>Section</h2>\n<h3>Subsection</h3>',
  }
}

function fog(ctx: FixContext): HauntingFix {
  const need = ctx.threshold === undefined ? '4.5:1' : `${ctx.threshold}:1`
  return {
    instruction: `Darken the text or lighten the background until the contrast ratio is at least ${need}.`,
    codeSnippet: '.text { color: #595959; background-color: #ffffff; }',
  }
}

/** Plain-language fix steps plus an HTML/ARIA/CSS template. */
export function generateFix(type: HauntingType, context: FixContext = {}): HauntingFix {
  switch (type) {
    case 'NamelessSpirit':
      return nameless(context)
    case 'HollowPortrait':
      return {
        instruction: 'Add alt text that describes the image. Use alt="" only when the image is purely decorative.',
        codeSnippet: '<img src="photo.jpg" alt="Describe what the image shows">',
      }
    case 'TheFog':
      return fog(context)
    case 'LostSoul':
      return {
        instruction: 'Use a native <button> (or <a href>) instead of a clickable <div>, so it takes focus and works with Enter and Space.',
        codeSnippet: '<button type="button" class="card-action">Open details</button>',
      }
    case 'CursedLoop':
      return {
        instruction: 'Let keyboard users leave the region: close it on Escape, return focus to the trigger, and make the rest of the page reachable.',
        codeSnippet: '<div role="dialog" aria-modal="true" aria-labelledby="t">\n  <h2 id="t">Title</h2>\n  <button type="button">Close</button>\n</div>',
      }
    case 'InvisibleWanderer':
      return {
        instruction: 'Show a focus indicator: an outline of at least 2px with 3:1 contrast against the background. Do not remove it with outline: none.',
        codeSnippet: ':focus-visible { outline: 2px solid #1a56db; outline-offset: 2px; }',
      }
    case 'WhisperingField':
      return whispering(context)
    case 'SilentTongue':
      return { instruction: 'Set a valid BCP 47 language code on the html element.', codeSnippet: '<html lang="en">' }
    case 'ShatteredOrder':
      return shattered(context)
    case 'TheVeiled':
      return {
        instruction: 'Remove aria-hidden from content people need to read or use. Keep it only on purely decorative graphics, and never on focusable elements.',
        codeSnippet: '<div>\n  <p>Content that screen readers should announce</p>\n</div>',
      }
  }
}
