// Cursed Shop verifier — recomputes every haunting count from .kiro/steering/hauntings.md
// using a real Chromium Tab walk (with the escape test), CDP Accessibility + DOMDebugger,
// axe-core, and DOM measurement, then compares the result with expected-hauntings.json.
//
// Run: npm run verify   (uses the real Chromium channel: UNSEEN_CHROMIUM_CHANNEL || 'chromium')
import { chromium } from 'playwright';
import { fileURLToPath as __f2p, pathToFileURL as __p2u } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import AxeBuilder from '@axe-core/playwright';

const __dirname = path.dirname(__f2p(import.meta.url));
const BASE = __p2u(__dirname).href + '/'; // file:// URLs — no external server needed
const golden = JSON.parse(fs.readFileSync(path.join(__dirname, 'expected-hauntings.json'), 'utf8'));
const PAGES = ['index.html', 'product.html', 'checkout.html'];

const INTERACTIVE = ['button', 'link', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab', 'checkbox', 'radio', 'switch', 'option', 'combobox', 'listbox', 'treeitem', 'gridcell'];
const FIELD_ROLES = ['textbox', 'searchbox', 'spinbutton', 'slider', 'combobox'];
const NATIVE_SEL = 'button, a[href], input, select, textarea, summary, [contenteditable]:not([contenteditable="false"])';

// ---------- in-page helpers (installed via page.evaluate) ----------
const HELPERS = () => {
  const W = window;
  W.__parse = (c) => { if (!c) return null; const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  W.__lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  W.__ratio = (a, b) => { const l1 = W.__lum(a), l2 = W.__lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  W.__blend = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
  W.__effBg = (el) => { const layers = []; let uncertain = false; for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.backgroundImage && cs.backgroundImage !== 'none') { uncertain = true; break; } const c = W.__parse(cs.backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; } } let col = { r: 255, g: 255, b: 255, a: 1 }; for (let i = layers.length - 1; i >= 0; i--) col = W.__blend(layers[i], col); return { color: col, uncertain }; };
  W.__path = (el) => { if (!el || el.nodeType !== 1) return String(el); const parts = []; for (let n = el; n && n.nodeType === 1 && n !== document.documentElement; n = n.parentElement) { let s = n.tagName.toLowerCase(); if (n.id) { s += '#' + n.id; parts.unshift(s); break; } const cls = [...n.classList].slice(0, 2).map((c) => '.' + c).join(''); s += cls; const idx = n.parentElement ? [...n.parentElement.children].indexOf(n) + 1 : 1; if (n.parentElement && n.parentElement.children.length > 1) s += `:nth-child(${idx})`; parts.unshift(s); if (n.tagName === 'BODY') break; } return parts.join(' > '); };
  W.__label = (el) => { if (!el || el.nodeType !== 1) return String(el); const t = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 40); return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''} "${t}"`; };
  let vid = 0; W.__tag = () => { document.querySelectorAll('*').forEach((e) => { if (e.__vid === undefined) e.__vid = ++vid; }); }; W.__tag();
  W.__visible = (el) => { const r = el.getBoundingClientRect(); if (r.width <= 0 || r.height <= 0) return false; for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.opacity === '0') return false; } return getComputedStyle(el).visibility !== 'hidden'; };
  W.__tabbables = () => [...document.querySelectorAll('a[href],button,input,select,textarea,summary,[tabindex],[contenteditable]')].filter((e) => e.tabIndex >= 0 && !e.disabled && !e.closest('[inert]') && W.__visible(e));
  W.__focusStyles = (el) => { const cs = getComputedStyle(el); const adj = W.__effBg(el.parentElement || el); return { outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, outlineColor: cs.outlineColor, outlineOffset: cs.outlineOffset, boxShadow: cs.boxShadow, border: [cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor].join('|'), backgroundColor: cs.backgroundColor, textDecoration: cs.textDecorationLine, adjBg: adj.color, adjUncertain: adj.uncertain }; };
};

// Node-side color math (mirrors the in-page helpers)
function parseColor(c) { if (!c) return null; if (typeof c === 'object') return c; const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; }
function lum(c) { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); }
function ratio(a, b) { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }
function blend(top, bot) { if (!top) return bot; return { r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 }; }

function judgeIndicator(before, after) {
  const reasons = [];
  // (a) outline
  if (after.outlineStyle !== 'none' && parseFloat(after.outlineWidth) >= 1) { const oc = parseColor(after.outlineColor); if (oc && oc.a > 0) { const r = ratio(blend(oc, after.adjBg), after.adjBg); if (r >= 3) reasons.push('a'); else reasons.push('a-fail'); } }
  // Chromium quirk: ignore outline deltas when outline-style is none
  // (b) box-shadow
  if (before && after.boxShadow !== before.boxShadow && after.boxShadow !== 'none') { const cols = [...after.boxShadow.matchAll(/rgba?\([^)]+\)/g)].map((m) => parseColor(m[0])).filter((c) => c && c.a > 0); const best = Math.max(0, ...cols.map((c) => ratio(blend(c, after.adjBg), after.adjBg))); if (best >= 3) reasons.push('b'); else reasons.push('b-fail'); }
  // (c) border / background change
  if (before && after.border !== before.border) { const bs = before.border.split('|').map(parseColor), as = after.border.split('|').map(parseColor); const best = Math.max(0, ...as.map((c, i) => (c && bs[i] ? ratio(blend(c, after.adjBg), blend(bs[i], after.adjBg)) : 0))); if (best >= 3) reasons.push('c'); else reasons.push('c-fail'); }
  if (before && after.backgroundColor !== before.backgroundColor) { const r = ratio(blend(parseColor(after.backgroundColor), after.adjBg), blend(parseColor(before.backgroundColor), after.adjBg)); if (r >= 3) reasons.push('c'); else reasons.push('c-fail'); }
  // (d) text-decoration change
  if (before && after.textDecoration !== before.textDecoration) reasons.push('d');
  return reasons.some((r) => /^[abcd]$/.test(r));
}

async function vidOfBackend(cdp, backendNodeId) {
  try {
    const { object } = await cdp.send('DOM.resolveNode', { backendNodeId });
    const r = await cdp.send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: 'function(){const e=this.nodeType===1?this:this.parentElement;return e?{vid:e.__vid,path:window.__path(e),label:window.__label(e)}:null}', returnByValue: true });
    return r.result.value;
  } catch (e) { return null; }
}

async function tabWalk(page) {
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
  await page.evaluate(() => window.__tag());
  const walkStartedAtMs = Date.now();
  const tabbablesAtStart = await page.evaluate(() => window.__tabbables().map((e) => e.__vid));
  const cap = tabbablesAtStart.length * 2 + 10;
  const baseline = await page.evaluate(() => { const o = {}; window.__tabbables().forEach((e) => { if (e !== document.activeElement) o[e.__vid] = window.__focusStyles(e); }); return o; });
  const steps = []; const visited = new Set(); let segment = new Map(); let segIdx = 0; const cycles = []; let endReason = 'cap';
  let prevVid = await page.evaluate(() => document.activeElement && document.activeElement !== document.body ? document.activeElement.__vid : null);
  for (let s = 0; s < cap; s++) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(30);
    const info = await page.evaluate((prev) => {
      window.__tag();
      const a = document.activeElement;
      let prevStyles = null;
      if (prev != null) { const p = [...document.querySelectorAll('*')].find((e) => e.__vid === prev); if (p && p !== a) prevStyles = window.__focusStyles(p); }
      if (!a || a === document.body || a === document.documentElement) return { body: true, prevStyles };
      const r = a.getBoundingClientRect();
      return { vid: a.__vid, path: window.__path(a), label: window.__label(a), styles: window.__focusStyles(a), rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], prevStyles };
    }, prevVid);
    if (prevVid != null && info.prevStyles && !baseline[prevVid]) baseline[prevVid] = info.prevStyles;
    if (info.body) { endReason = 'body'; steps.push({ step: s + 1, body: true }); break; }
    steps.push({ step: s + 1, seg: segIdx, ...info, prevStyles: undefined });
    prevVid = info.vid;
    if (segment.has(info.vid)) {
      const segSteps = steps.filter((x) => x.seg === segIdx && !x.body);
      const cyc = segSteps.slice(segment.get(info.vid)).map((x) => x.vid);
      const cycSet = new Set(cyc);
      const nowTabbables = await page.evaluate(() => window.__tabbables().map((e) => e.__vid));
      const allVisited = nowTabbables.every((v) => visited.has(v));
      if (allVisited) { cycles.push({ members: [...cycSet], allVisited: true, escapable: null }); endReason = 'cycle-includes-all-focusables'; break; }
      await page.keyboard.press('Escape'); await page.waitForTimeout(50);
      const afterEsc = await page.evaluate(() => window.__label(document.activeElement));
      await page.keyboard.press('Shift+Tab'); await page.waitForTimeout(50);
      const container = await page.evaluate((ids) => {
        const els = ids.map((id) => [...document.querySelectorAll('*')].find((e) => e.__vid === id));
        let anc = els[0];
        while (anc && !els.every((e) => anc.contains(e))) anc = anc.parentElement;
        const dlg = els[0].closest('[role=dialog],[aria-modal=true],dialog');
        const region = dlg || anc;
        return { commonAncestor: window.__path(anc), dialog: dlg ? window.__path(dlg) : null, regionVid: region ? region.__vid : null, memberLabels: ids.map((id) => window.__label([...document.querySelectorAll('*')].find((e) => e.__vid === id))) };
      }, [...cycSet]);
      const after = await page.evaluate(() => { const a = document.activeElement; return { vid: a && a !== document.body ? a.__vid : null, label: window.__label(a), path: window.__path(a) }; });
      const escaped = after.vid == null ? true : !cycSet.has(after.vid);
      cycles.push({ atStep: s + 1, members: container.memberLabels, container, afterEscape: afterEsc, afterShiftTab: after.label, escapable: escaped });
      if (escaped) { segIdx++; segment = new Map(); prevVid = after.vid; if (after.vid != null) segment.set(after.vid, 0); continue; }
      endReason = 'trap-declared'; break;
    }
    segment.set(info.vid, steps.filter((x) => x.seg === segIdx && !x.body).length - 1);
    visited.add(info.vid);
  }
  return { walkStartedAtMs, focusableCount: tabbablesAtStart.length, cap, steps, cycles, endReason, baseline };
}

async function lostSouls(page, cdp, walkVids) {
  const { result } = await cdp.send('Runtime.evaluate', { expression: 'Array.from(document.querySelectorAll("*"))' });
  const props = await cdp.send('Runtime.getProperties', { objectId: result.objectId, ownProperties: true });
  const els = props.result.filter((p) => /^\d+$/.test(p.name)).map((p) => p.value.objectId);
  const hits = [];
  for (const objectId of els) {
    const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId, depth: 0 });
    const types = listeners.map((l) => l.type).filter((t) => ['click', 'mousedown', 'pointerdown', 'pointerup'].includes(t));
    if (!types.length) continue;
    const r = await cdp.send('Runtime.callFunctionOn', { objectId, returnByValue: true, functionDeclaration: `function(){const NATIVE=${JSON.stringify(NATIVE_SEL)};const role=(this.getAttribute('role')||'').trim();return{vid:this.__vid,path:window.__path(this),label:window.__label(this),role,tabIndex:this.tabIndex,native:this.matches(NATIVE),insideNative:!!(this.parentElement&&this.parentElement.closest(NATIVE)),containsNative:!!this.querySelector(NATIVE),cursor:getComputedStyle(this).cursor};}` });
    hits.push({ ...r.result.value, types });
  }
  const qualifying = hits.filter((h) => !walkVids.has(h.vid) && !INTERACTIVE.includes(h.role) && !h.native && !h.insideNative && !h.containsNative);
  const ancestry = await page.evaluate((ids) => { const map = {}; const all = [...document.querySelectorAll('*')]; ids.forEach((id) => { const e = all.find((x) => x.__vid === id); map[id] = ids.filter((o) => o !== id && all.find((x) => x.__vid === o).contains(e)); }); return map; }, qualifying.map((q) => q.vid));
  const outer = qualifying.filter((q) => ancestry[q.vid].length === 0);
  return outer;
}

async function detectPage(browser, name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  await page.goto(BASE + name, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.evaluate(HELPERS);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('DOM.enable'); await cdp.send('Accessibility.enable');
  await cdp.send('DOM.getDocument', { depth: -1 });
  const H = {};

  // AX tree
  const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  const ax = nodes.filter((n) => n.backendDOMNodeId != null).map((n) => ({ n, role: n.role?.value, name: (n.name?.value || '').trim(), ignored: n.ignored }));

  // Nameless Spirit
  H.NamelessSpirit = [];
  for (const a of ax) if (!a.ignored && INTERACTIVE.includes(a.role) && a.name === '') { const v = await vidOfBackend(cdp, a.n.backendDOMNodeId); if (v) H.NamelessSpirit.push({ vid: v.vid, path: v.path, label: v.label, role: a.role }); }

  // Hollow Portrait
  H.HollowPortrait = [];
  for (const a of ax) {
    if (a.ignored || !['img', 'image'].includes(a.role) || a.name !== '') continue;
    const v = await vidOfBackend(cdp, a.n.backendDOMNodeId);
    if (!v) continue;
    const d = await page.evaluate((vid) => { const e = [...document.querySelectorAll('*')].find((x) => x.__vid === vid); if (!e) return null; const role = e.getAttribute('role'); const ctl = e.parentElement && e.parentElement.closest('button,a[href]'); const soleContent = ctl ? ctl.textContent.trim() === '' && ctl.querySelectorAll('img,svg').length === 1 : false; return { tag: e.tagName.toLowerCase(), alt: e.getAttribute('alt'), role, ariaHidden: !!e.closest('[aria-hidden=true]'), soleContent }; }, v.vid);
    if (!d) continue;
    if (d.alt === '' || ['presentation', 'none'].includes(d.role) || d.ariaHidden) continue;
    if (d.tag === 'svg' && d.role !== 'img') continue;
    if (d.soleContent) continue;
    H.HollowPortrait.push({ vid: v.vid, path: v.path, label: v.label });
  }

  // Whispering Field
  H.WhisperingField = [];
  for (const a of ax) {
    if (a.ignored || !FIELD_ROLES.includes(a.role)) continue;
    const v = await vidOfBackend(cdp, a.n.backendDOMNodeId);
    if (!v) continue;
    const srcs = a.n.name?.sources || [];
    const winning = srcs.find((s) => !s.superseded && s.value && String(s.value.value || '').trim() !== '');
    const wsrc = winning ? (winning.attribute || winning.nativeSource || winning.type) : null;
    if (a.name === '' || wsrc === 'placeholder') H.WhisperingField.push({ vid: v.vid, path: v.path, label: v.label, kind: a.name === '' ? 'empty' : 'placeholder-only' });
  }

  // Silent Tongue
  const lang = await page.evaluate(() => document.documentElement.getAttribute('lang'));
  H.SilentTongue = (lang == null || !/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(lang)) ? [{ path: 'html', vid: null }] : [];

  // landmarks + headings → Shattered Order
  const landmarks = ax.filter((a) => !a.ignored && ['main', 'banner', 'contentinfo', 'navigation', 'complementary', 'region', 'form', 'search'].includes(a.role)).map((a) => a.role);
  const heads = await page.evaluate(() => [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => ({ lvl: +h.tagName[1], vid: h.__vid, label: window.__label(h) })));
  H.ShatteredOrder = [];
  if (!heads.some((h) => h.lvl === 1)) H.ShatteredOrder.push({ kind: 'no-h1', vid: null });
  for (let i = 1; i < heads.length; i++) if (heads[i].lvl > heads[i - 1].lvl + 1) H.ShatteredOrder.push({ kind: 'heading-skip', vid: heads[i].vid, label: heads[i].label });
  if (!landmarks.includes('main')) H.ShatteredOrder.push({ kind: 'no-main', vid: null });

  // The Veiled
  const veiled = await page.evaluate(() => {
    const out = []; const docW = document.documentElement.scrollWidth, docH = document.documentElement.scrollHeight;
    const roots = [...document.querySelectorAll('[aria-hidden=true],[role=presentation],[role=none]')].filter((e) => !e.parentElement.closest('[aria-hidden=true],[role=presentation],[role=none]'));
    for (const e of roots) {
      if (e.tagName === 'IMG' && e.getAttribute('alt') === '') continue;
      const r = e.getBoundingClientRect(); const x = r.left + scrollX, y = r.top + scrollY;
      const intersects = r.width > 0 && r.height > 0 && x + r.width > 0 && y + r.height > 0 && x < docW && y < docH;
      const vis = window.__visible(e) && intersects;
      const focusables = [...e.querySelectorAll('a[href],button,input,select,textarea,[tabindex]')].filter((f) => f.tabIndex >= 0 && !f.disabled);
      if (e.matches('a[href],button,input,select,textarea,[tabindex]') && e.tabIndex >= 0) focusables.push(e);
      let text = ''; const tw = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
      while (tw.nextNode()) { const t = tw.currentNode; if (t.textContent.trim() && t.parentElement && window.__visible(t.parentElement)) text += t.textContent.trim() + ' '; }
      out.push({ vid: e.__vid, path: window.__path(e), visible: vis, text: text.trim().slice(0, 60), focusables: focusables.map((f) => window.__label(f)) });
    }
    return out;
  });
  H.TheVeiled = veiled.filter((v) => v.focusables.length > 0 || (v.visible && v.text));

  // The Fog — per-text-element contrast walk
  H.TheFog = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      if (['SCRIPT', 'STYLE', 'svg', 'SVG', 'OPTION'].includes(el.tagName) || el.closest('svg')) continue;
      const hasText = [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim());
      if (!hasText || !window.__visible(el)) continue;
      if (el.closest('[aria-disabled=true]') || el.matches(':disabled')) continue;
      const cs = getComputedStyle(el); const fg = window.__parse(cs.color); const bg = window.__effBg(el);
      if (bg.uncertain) continue;
      const r = window.__ratio(window.__blend(fg, bg.color), bg.color);
      const size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight) >= 700;
      const large = size >= 24 || (bold && size >= 18.66);
      if (r < (large ? 3 : 4.5)) out.push({ vid: el.__vid, path: window.__path(el), label: window.__label(el) });
    }
    return out;
  });

  // Tab walk → Invisible Wanderer + Cursed Loop
  const walk = await tabWalk(page);
  const walkVids = new Set(walk.steps.filter((s) => !s.body).map((s) => s.vid));
  const seenIW = new Set();
  H.InvisibleWanderer = [];
  for (const s of walk.steps) {
    if (s.body || seenIW.has(s.vid)) continue; seenIW.add(s.vid);
    const before = walk.baseline[s.vid] || null;
    if (!judgeIndicator(before, s.styles)) H.InvisibleWanderer.push({ vid: s.vid, path: s.path, label: s.label });
  }
  H.CursedLoop = walk.cycles.filter((c) => c.escapable === false && !c.allVisited).map((c) => ({ regionVid: c.container.regionVid, path: c.container.dialog || c.container.commonAncestor, members: c.members }));

  // Lost Soul
  H.LostSoul = await lostSouls(page, cdp, walkVids);

  // axe (for the §21 expectations)
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const axeBP = await new AxeBuilder({ page }).withRules(['heading-order']).analyze();
  const axeData = {
    violations: Object.fromEntries(axe.violations.map((v) => [v.id, v.nodes.length])),
    incomplete: Object.fromEntries(axe.incomplete.map((v) => [v.id, v.nodes.length])),
    headingOrder: axeBP.violations.flatMap((v) => v.nodes.map((n) => n.target.join(' '))),
  };

  await ctx.close();
  return { hauntings: H, walk, axe: axeData };
}

// CursedLoop match: the trap-region node must be the selector element or a descendant of it.
async function cursedLoopMatches(page, selector, regionVid) {
  return await page.evaluate(({ sel, rvid }) => {
    const g = document.querySelector(sel); if (!g) return false;
    const r = [...document.querySelectorAll('*')].find((e) => e.__vid === rvid); if (!r) return false;
    return g === r || g.contains(r);
  }, { sel: selector, rvid: regionVid });
}

function countsOf(H) {
  const out = {};
  for (const k of ['NamelessSpirit', 'HollowPortrait', 'TheFog', 'LostSoul', 'CursedLoop', 'InvisibleWanderer', 'WhisperingField', 'SilentTongue', 'ShatteredOrder', 'TheVeiled']) out[k] = (H[k] || []).length;
  return out;
}

async function verifyGolden(ctx, page, name, detected) {
  const g = golden[name];
  const dH = detected.hauntings;
  const measured = countsOf(dH);
  const expected = {};
  for (const k of Object.keys(measured)) expected[k] = g?.hauntings?.[k]?.count ?? 0;
  const mismatches = [];

  // count comparison
  for (const k of Object.keys(measured)) {
    if (measured[k] !== expected[k]) mismatches.push(`${k}: expected ${expected[k]}, measured ${measured[k]}`);
  }

  // selector sanity: each golden selector (except CursedLoop/SilentTongue/ShatteredOrder no-main) matches exactly 1 element
  for (const [k, entry] of Object.entries(g?.hauntings || {})) {
    if (k === 'CursedLoop' || k === 'SilentTongue') continue; // matched by count + special rules
    for (const sel of entry.selectors || []) {
      const n = await page.evaluate((s) => { try { return document.querySelectorAll(s).length; } catch (e) { return -1; } }, sel);
      if (n !== 1) mismatches.push(`${k} selector '${sel}' matched ${n} (expected 1)`);
    }
  }

  // CursedLoop descendant match
  const clEntry = g?.hauntings?.CursedLoop;
  if (clEntry) {
    let matched = 0;
    for (const sel of clEntry.selectors || []) {
      for (const trap of dH.CursedLoop) {
        if (await cursedLoopMatches(page, sel, trap.regionVid)) { matched++; break; }
      }
    }
    if (matched !== clEntry.count) mismatches.push(`CursedLoop: ${matched} golden selector(s) matched a trap (expected ${clEntry.count})`);
    if (dH.CursedLoop.length !== clEntry.count) mismatches.push(`CursedLoop count: measured ${dH.CursedLoop.length} (expected ${clEntry.count})`);
  }

  // ShatteredOrder kinds multiset
  const soEntry = g?.hauntings?.ShatteredOrder;
  if (soEntry && soEntry.kinds) {
    const got = dH.ShatteredOrder.map((x) => x.kind).sort().join(',');
    const want = [...soEntry.kinds].sort().join(',');
    if (got !== want) mismatches.push(`ShatteredOrder kinds: measured [${got}] (expected [${want}])`);
  }

  // controls must NOT be flagged as the specific haunting they guard against
  // (a control can legitimately coexist with a *different* haunting — e.g. a visible-focus
  // button that is also a Nameless Spirit, or a decorative-alt thumbnail that is also a Lost Soul)
  const CONTROL_GUARD = {
    cookieBanner: ['CursedLoop'],
    decorativeImages: ['HollowPortrait'],
    accessibleCardLinks: ['LostSoul', 'NamelessSpirit'],
    namedQuickView: ['NamelessSpirit'],
    visibleFocus: ['InvisibleWanderer'],
    decorativeIcons: ['HollowPortrait', 'TheVeiled'],
    namedSocialLinks: ['NamelessSpirit'],
    hasMain: ['ShatteredOrder'],
    hasH1: ['ShatteredOrder'],
    hasLang: ['SilentTongue'],
    decorativeAltNotHollow: ['HollowPortrait'],
    namedField: ['WhisperingField'],
    properLabels: ['WhisperingField'],
    visibleFocusInTrap: ['InvisibleWanderer'],
    mouseOnlyNativeExits: ['LostSoul'],
  };
  for (const [k, c] of Object.entries(g?.controls || {})) {
    const guards = CONTROL_GUARD[k] || [];
    for (const sel of c.selectors || []) {
      const vids = await page.evaluate((s) => { try { return [...document.querySelectorAll(s)].map((e) => e.__vid); } catch (e) { return []; } }, sel);
      for (const v of vids) for (const hk of guards) if ((dH[hk] || []).some((a) => a.vid === v)) mismatches.push(`control ${k} '${sel}' was flagged as ${hk}`);
    }
  }

  return { expected, measured, mismatches };
}

async function checkImgs(browser, name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + name, { waitUntil: 'networkidle' });
  await page.evaluate(async () => { for (const i of document.images) { i.loading = 'eager'; i.scrollIntoView(); await new Promise((r) => setTimeout(r, 50)); } });
  await page.waitForTimeout(600);
  const bad = await page.evaluate(() => [...document.images].filter((i) => i.naturalWidth <= 0).map((i) => i.getAttribute('src')));
  await ctx.close();
  return bad;
}

async function checkScrollWidth(browser, name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(BASE + name, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  await ctx.close();
  return sw;
}

async function checkTrueTrap(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  await page.goto(BASE + 'checkout.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const state = () => page.evaluate(() => { const m = document.getElementById('newsletterModal'); const a = document.activeElement; return { active: m && m.classList.contains('active'), inModal: !!(m && a && m.contains(a)), focus: a ? a.tagName + (a.id ? '#' + a.id : '') : 'null' }; });
  const problems = [];
  // Enter/Space on each reachable element (input, then Subscribe)
  for (let k = 0; k < 2; k++) {
    for (const key of ['Enter', 'Space']) {
      const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const p2 = await ctx2.newPage(); p2.on('dialog', (d) => d.dismiss().catch(() => {}));
      await p2.goto(BASE + 'checkout.html', { waitUntil: 'networkidle' }); await p2.waitForTimeout(400);
      for (let i = 0; i < k; i++) await p2.keyboard.press('Tab');
      await p2.keyboard.press(key); await p2.waitForTimeout(250);
      const s = await p2.evaluate(() => { const m = document.getElementById('newsletterModal'); const a = document.activeElement; return { active: !!m && m.classList.contains('active'), inModal: !!(m && a && m.contains(a)) }; });
      if (!s.active || !s.inModal) problems.push(`${key} on reachable #${k} closed the modal`);
      await ctx2.close();
    }
  }
  // Escape alone
  const s1 = await state(); await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  const s2 = await state();
  if (!s2.active || !s2.inModal) problems.push('Escape closed the modal');
  // Escape then Shift+Tab
  await page.keyboard.press('Shift+Tab'); await page.waitForTimeout(150);
  const s3 = await state();
  if (!s3.active || !s3.inModal) problems.push('Escape+Shift+Tab left the modal');
  await ctx.close();
  return problems;
}

async function checkCookieBanner(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + 'index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const info = await page.evaluate(() => { const b = document.getElementById('cookieBanner'); return { exists: !!b, text: b ? b.textContent : '' }; });
  // Tab to the banner (× then Accept), confirm cycle + Escape closes
  const focusSeq = [];
  for (let i = 0; i < 40; i++) { await page.keyboard.press('Tab'); await page.waitForTimeout(30); const f = await page.evaluate(() => { const a = document.activeElement; return a && a.closest ? (a.closest('#cookieBanner') ? a.getAttribute('aria-label') || a.textContent : null) : null; }); if (f) focusSeq.push(f); if (focusSeq.length >= 3) break; }
  const cycled = focusSeq.length >= 3 && focusSeq[0] === focusSeq[2];
  // Escape should close it (add hidden + inert)
  // move focus into the banner first if not already
  await page.evaluate(() => { const b = document.getElementById('cookieBanner'); if (b) b.querySelector('.btn-close').focus(); });
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  const closed = await page.evaluate(() => { const b = document.getElementById('cookieBanner'); return b && (b.classList.contains('hidden') || b.hasAttribute('inert')); });
  await ctx.close();
  const problems = [];
  if (!info.exists) problems.push('cookie banner #cookieBanner missing');
  if (!cycled) problems.push('cookie banner did not cycle × → Accept → ×');
  if (!closed) problems.push('cookie banner Escape did not close it');
  return problems;
}

async function main() {
  const browser = await chromium.launch({ channel: process.env.UNSEEN_CHROMIUM_CHANNEL || 'chromium' });
  let failed = false;
  const addFail = (m) => { failed = true; console.error('  FAIL: ' + m); };

  console.log('\n=== image load check (naturalWidth > 0) ===');
  for (const name of PAGES) {
    const bad = await checkImgs(browser, name);
    if (bad.length) { addFail(`${name}: ${bad.length} broken <img>: ${JSON.stringify(bad)}`); console.log(`  ${name}: BROKEN ${JSON.stringify(bad)}`); }
    else console.log(`  ${name}: all ${bad.length === 0 ? 'images OK' : ''}`);
  }

  console.log('\n=== 390px scrollWidth === 390 ===');
  for (const name of PAGES) {
    const sw = await checkScrollWidth(browser, name);
    const ok = sw === 390;
    if (!ok) addFail(`${name}: scrollWidth=${sw} (expected 390)`);
    console.log(`  ${name}: scrollWidth=${sw} ${ok ? 'OK' : 'FAIL'}`);
  }

  console.log('\n=== cookie banner (escapable) & newsletter modal (true trap) ===');
  const cookieProblems = await checkCookieBanner(browser);
  if (cookieProblems.length) for (const p of cookieProblems) addFail('cookie: ' + p);
  console.log(`  index cookie banner: ${cookieProblems.length ? 'FAIL ' + JSON.stringify(cookieProblems) : 'escapable OK'}`);
  const trapProblems = await checkTrueTrap(browser);
  if (trapProblems.length) for (const p of trapProblems) addFail('trap: ' + p);
  console.log(`  checkout newsletter trap: ${trapProblems.length ? 'FAIL ' + JSON.stringify(trapProblems) : 'true trap OK'}`);

  console.log('\n=== haunting counts (expected vs measured) ===');
  const rows = [];
  for (const name of PAGES) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    await page.goto(BASE + name, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.evaluate(HELPERS);
    const detected = await detectPage(browser, name);
    const cmp = await verifyGolden(ctx, page, name, detected);
    for (const m of cmp.mismatches) addFail(`${name}: ${m}`);
    rows.push({ name, expected: cmp.expected, measured: cmp.measured });

    // §21 axe expectations
    if (name === 'checkout.html') {
      if ((detected.axe.violations.label || 0) !== 0) addFail('checkout axe label violation count should be 0');
      if (detected.axe.violations['aria-hidden-focus']) addFail('checkout aria-hidden-focus should be incomplete, not a violation');
      if (!detected.axe.incomplete['aria-hidden-focus']) addFail('checkout aria-hidden-focus should appear as incomplete');
    }
    await ctx.close();
  }

  // print the per-page table
  const keys = ['NamelessSpirit', 'HollowPortrait', 'TheFog', 'LostSoul', 'CursedLoop', 'InvisibleWanderer', 'WhisperingField', 'SilentTongue', 'ShatteredOrder', 'TheVeiled'];
  console.log('\n=== expected vs measured ===');
  let header = 'Haunting'.padEnd(20);
  for (const r of rows) header += ` | ${r.name.replace('.html', '')} exp/meas`;
  console.log(header);
  console.log('-'.repeat(header.length));
  for (const k of keys) {
    let line = k.padEnd(20);
    for (const r of rows) line += ` | ${String(r.expected[k]).padStart(3)}/${String(r.measured[k]).padStart(3)}`;
    console.log(line);
  }

  await browser.close();
  if (failed) { console.error('\nVERIFY FAILED'); process.exitCode = 1; }
  else console.log('\nVERIFY PASSED');
}

main().catch((e) => { console.error(e); process.exit(1); });
