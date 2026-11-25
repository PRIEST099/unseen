/** Longest HTML snippet the engine stores or reports, ellipsis included. */
export const SNIPPET_MAX_CHARS = 300

/** Appended to a snippet that was shortened, so readers (and the Kiro prompt) can tell it is partial. */
export const SNIPPET_ELLIPSIS = '…'

/**
 * Shorten `text` to at most `max` characters. A shortened snippet keeps its first `max - 1` characters and
 * ends with "…"; a snippet that already fits is returned unchanged. Pass `truncated` when the text was
 * already cut upstream (it then gets the ellipsis even if it fits).
 */
export function clipSnippet(text: string, truncated = false, max: number = SNIPPET_MAX_CHARS): string {
  if (!truncated && text.length <= max) return text
  return `${text.slice(0, max - SNIPPET_ELLIPSIS.length)}${SNIPPET_ELLIPSIS}`
}
