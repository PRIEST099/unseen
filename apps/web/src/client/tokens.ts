/**
 * Design tokens mirrored from `styles/tokens.css` (see .kiro/steering/design-system.md).
 * `tokens.test.ts` checks that both files agree and that the colour pairs meet WCAG contrast.
 */
export const COLORS = {
  INK: '#0B0A10',
  BONE: '#ECE6D6',
  ECTO: '#7CF5C8',
  EMBER: '#FF5A4E',
  CANDLE: '#F4B860',
  MIST: '#8E8AA8',
} as const

export const TEXT_SIZES = {
  XS: '0.75rem',
  SM: '0.875rem',
  BASE: '1rem',
  LG: '1.125rem',
  XL: '1.25rem',
  XXL: '1.5rem',
  XXXL: '2rem',
  DISPLAY: '3rem',
} as const

export const SPACING = {
  1: '0.25rem',
  2: '0.5rem',
  3: '0.75rem',
  4: '1rem',
  6: '1.5rem',
  8: '2rem',
  12: '3rem',
  16: '4rem',
} as const
