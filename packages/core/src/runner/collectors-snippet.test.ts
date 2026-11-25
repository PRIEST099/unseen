import { expect, test } from 'vitest'
import { SNIPPET_MAX_CHARS, snippetOf, type CdpDomNode } from './collectors.js'

let nextId = 1
const el = (tag: string, attrs: Record<string, string> = {}, children: CdpDomNode[] = []): CdpDomNode => ({
  nodeType: 1,
  nodeName: tag.toUpperCase(),
  localName: tag,
  backendNodeId: nextId++,
  attributes: Object.entries(attrs).flat(),
  children,
})
const text = (value: string): CdpDomNode => ({ nodeType: 3, nodeName: '#text', nodeValue: value, backendNodeId: nextId++ })

test('a small element is serialised whole, with no ellipsis', () => {
  expect(snippetOf(el('button', { class: 'buy' }, [text('Buy')]))).toBe('<button class="buy">Buy</button>')
})

test('a large element is cut to the limit and ends with "…"', () => {
  const body = el('body', {}, [el('main', {}, Array.from({ length: 40 }, (_, i) => el('p', { id: `p${i}` }, [text('Some words here')])))])
  const out = snippetOf(body)
  expect(out).toHaveLength(SNIPPET_MAX_CHARS)
  expect(out.endsWith('…')).toBe(true)
  expect(out.startsWith('<body><main><p id="p0">Some words here</p>')).toBe(true)
})

test('an element cut exactly at the limit (closing tag dropped) is still marked as shortened', () => {
  // `<div>` + 295 characters of text = 300 characters, so `</div>` no longer fits.
  const out = snippetOf(el('div', {}, [text('z'.repeat(SNIPPET_MAX_CHARS - '<div>'.length))]))
  expect(out).toHaveLength(SNIPPET_MAX_CHARS)
  expect(out.endsWith('…')).toBe(true)
})

test('an element that fits exactly is not marked', () => {
  const inner = 'q'.repeat(SNIPPET_MAX_CHARS - '<div></div>'.length)
  expect(snippetOf(el('div', {}, [text(inner)]))).toBe(`<div>${inner}</div>`)
})

test('a long text node is cut with "…"', () => {
  const out = snippetOf(text('w'.repeat(SNIPPET_MAX_CHARS * 2)))
  expect(out).toBe(`${'w'.repeat(SNIPPET_MAX_CHARS - 1)}…`)
})
