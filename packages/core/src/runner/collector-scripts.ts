/**
 * Page-side code for the collectors, as source strings run through CDP
 * (`Runtime.evaluate` / `Runtime.callFunctionOn`). Element lists are kept as remote
 * objects and passed by objectId, never through a `window` global, so the audited
 * page cannot intercept or replace them.
 */

/** Elements that directly own non-whitespace text. No layout is read here. */
export const TEXT_ELEMENTS_EXPR = `(() => {
  const out = []
  for (const el of document.querySelectorAll('body *')) {
    for (const n of el.childNodes) {
      if (n.nodeType === 3 && n.textContent.trim() !== '') { out.push(el); break }
    }
  }
  return out
})()`

/**
 * `this` = the text elements, args = (start, n). Handles at most n elements per call.
 * Returns `{ idx, rows }` for the elements in the slice that are visible.
 */
export const TEXT_BATCH_FN = `function (start, n) {
  const els = Array.prototype.slice.call(this, start, start + n)
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  const cache = new Map()
  // Resolve any CSS colour (rgb, oklch, lab, color-mix results, ...) to RGBA by painting it on a 1x1
  // canvas. Returns null when the browser cannot parse it.
  const resolve = (c) => {
    if (cache.has(c)) return cache.get(c)
    let out = null
    if (ctx) {
      ctx.fillStyle = '#010203'
      ctx.fillStyle = c
      if (ctx.fillStyle !== '#010203' || c.replace(/\\s/g, '') === 'rgb(1,2,3)') {
        ctx.clearRect(0, 0, 1, 1)
        ctx.fillRect(0, 0, 1, 1)
        const d = ctx.getImageData(0, 0, 1, 1).data
        out = { r: d[0], g: d[1], b: d[2], a: d[3] / 255 }
      }
    }
    cache.set(c, out)
    return out
  }
  const rgbString = (c) => 'rgb(' + c.r + ', ' + c.g + ', ' + c.b + ')'
  // Keep rgb()/rgba() strings as the browser serialised them; normalise everything else.
  const normalise = (c) => {
    if (/^rgba?\\(/.test(c)) return c
    const rgba = resolve(c)
    return rgba && rgba.a === 1 ? rgbString(rgba) : c
  }
  // A ::before/::after box that paints an image, gradient or (when overlaid) a colour.
  const paintsPseudo = (el, which) => {
    const p = getComputedStyle(el, which)
    if (p.content === 'none' || p.content === 'normal') return false
    if (p.backgroundImage !== 'none') return true
    const col = resolve(p.backgroundColor)
    const overlay = p.position === 'absolute' || p.position === 'fixed'
    return overlay && (col === null || col.a > 0)
  }
  // Every element that paints something (media, an image or gradient, a colour), in document
  // coordinates. Computed once per list and kept on the list object.
  const MEDIA = /^(img|video|canvas|svg|picture|object|embed|iframe)$/i
  const findPainters = () => {
    const sx = window.scrollX, sy = window.scrollY
    const out = []
    for (const o of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(o)
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue
      let paints = MEDIA.test(o.tagName) || cs.backgroundImage !== 'none'
      if (!paints) { const col = resolve(cs.backgroundColor); paints = col === null || col.a > 0 }
      if (!paints) continue
      const r = o.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      out.push({ el: o, l: r.left + sx, t: r.top + sy, r: r.right + sx, b: r.bottom + sy })
    }
    return out
  }
  if (!this.__unseenPainters) this.__unseenPainters = findPainters()
  const painters = this.__unseenPainters
  const textRect = (el) => {
    for (const node of el.childNodes) {
      if (node.nodeType !== 3 || node.textContent.trim() === '') continue
      const range = document.createRange()
      range.selectNodeContents(node)
      const b = range.getBoundingClientRect()
      if (b.width > 0 && b.height > 0) return b
    }
    return null
  }
  // A painting element that is neither an ancestor nor a descendant sits under or over the text's centre.
  const layered = (el) => {
    const tr = textRect(el)
    if (!tr) return false
    const cx = tr.left + tr.width / 2 + window.scrollX
    const cy = tr.top + tr.height / 2 + window.scrollY
    return painters.some((p) => cx >= p.l && cx <= p.r && cy >= p.t && cy <= p.b && !p.el.contains(el) && !el.contains(p.el))
  }
  const visible = (el) => {
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0 && el.checkVisibility({ visibilityProperty: true, opacityProperty: true })
  }
  const measure = (el) => {
    const cs = getComputedStyle(el)
    let uncertain = layered(el)
    let bg = 'rgb(255, 255, 255)'
    for (let cur = el; cur; cur = cur.parentElement) {
      const c = getComputedStyle(cur)
      if (c.backgroundImage && c.backgroundImage !== 'none') uncertain = true
      if (paintsPseudo(cur, '::before') || paintsPseudo(cur, '::after')) uncertain = true
      const col = resolve(c.backgroundColor)
      if (col === null) { uncertain = true; continue } // never treated as transparent
      if (col.a === 0) continue
      if (col.a < 1) { uncertain = true; continue }
      bg = normalise(c.backgroundColor)
      break
    }
    return { color: normalise(cs.color), backgroundColor: bg, fontSize: cs.fontSize, fontWeight: cs.fontWeight, backgroundUncertain: uncertain }
  }
  const idx = [], rows = []
  els.forEach((el, i) => {
    if (!visible(el)) return
    idx.push(start + i)
    rows.push(measure(el))
  })
  return { idx, rows }
}`

/** `this` = a list, args = (indices). The elements at those indices, as a new array. */
export const PICK_FN = `function (indices) { return indices.map((i) => this[i]) }`

/** `this` = a list of elements. Reads tag names, so ids and attributes come from the same snapshot. */
export const HEADING_TAGS_FN = `function () { return this.map((h) => h.tagName.toLowerCase()) }`
export const IMG_ALTS_FN = `function () { return this.map((i) => i.getAttribute('alt')) }`

/** `this` = a list of elements, args = (start, n). The Veiled rows for the slice. */
export const MAPPING_ROWS_FN = `function (start, n) {
  const els = Array.prototype.slice.call(this, start, start + n)
  const docW = document.documentElement.scrollWidth
  const docH = document.documentElement.scrollHeight
  const sx = window.scrollX
  const sy = window.scrollY
  const FOCUSABLE = 'a[href], area[href], button, input:not([type="hidden"]), select, textarea, iframe, summary, [contenteditable=""], [contenteditable="true"], [tabindex]'
  const isFocusable = (el) => {
    if (!el.matches(FOCUSABLE)) return false
    // A control that is not rendered, disabled (itself or via a fieldset) or inert cannot take focus.
    if (el.matches(':disabled')) return false
    if (el.closest('[inert]')) return false
    if (!el.checkVisibility({ visibilityProperty: true })) return false
    const ti = el.getAttribute('tabindex')
    return ti === null || Number(ti) >= 0
  }
  const visibleBox = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return false
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none') return false
    for (let cur = el; cur; cur = cur.parentElement) {
      if (Number(getComputedStyle(cur).opacity) === 0) return false
    }
    const x = r.left + sx
    const y = r.top + sy
    return x + r.width > 0 && y + r.height > 0 && x < docW && y < docH
  }
  return els.map((el) => {
    const visible = visibleBox(el)
    let ariaHidden = false
    for (let cur = el; cur; cur = cur.parentElement) {
      if (cur.getAttribute('aria-hidden') === 'true') { ariaHidden = true; break }
    }
    const role = el.getAttribute('role')
    let hasVisibleText = false
    if (visible) {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        if ((t.textContent || '').trim() !== '' && t.parentElement && visibleBox(t.parentElement)) { hasVisibleText = true; break }
      }
    }
    let containsFocusable = false
    for (const d of el.querySelectorAll(FOCUSABLE)) {
      if (isFocusable(d)) { containsFocusable = true; break }
    }
    return {
      visible,
      tagName: el.tagName.toLowerCase(),
      ariaHidden,
      isPresentational: role === 'presentation' || role === 'none',
      isFocusable: isFocusable(el),
      hasVisibleText,
      containsFocusable,
    }
  })
}`

/** `this` = a list, args = (start, n). A new array holding that slice. */
export const SLICE_FN = `function (start, n) { return Array.prototype.slice.call(this, start, start + n) }`

