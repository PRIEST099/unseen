
import { fileURLToPath as __f2p, pathToFileURL as __p2u } from 'node:url';
import __path from 'node:path'; import __os from 'node:os'; import __fs from 'node:fs';
const __REPO = __path.resolve(__path.dirname(__f2p(import.meta.url)), '../../../..');
__fs.mkdirSync(process.env.PROBE_OUT ?? __path.join(__os.tmpdir(), 'unseen-probes'), { recursive: true });
// Independent verifier implementing UPDATED hauntings.md rules. Read-only on the repo.
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';

const OUT = (process.env.PROBE_OUT ?? __path.join(__os.tmpdir(), 'unseen-probes')) + '/';
const BASE = __p2u(__path.join(__REPO, 'apps/cursed-shop')).href + '/';
const golden = JSON.parse(fs.readFileSync(__path.join(__REPO, 'apps/cursed-shop/expected-hauntings.json'), 'utf8'));
const PAGES = (process.argv[2] ? process.argv[2].split(',') : ['index.html', 'product.html', 'checkout.html']);

const INTERACTIVE = ['button', 'link', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab', 'checkbox', 'radio', 'switch', 'option', 'combobox', 'listbox', 'treeitem', 'gridcell'];
const FIELD_ROLES = ['textbox', 'searchbox', 'spinbutton', 'slider', 'combobox'];

// ---------- in-page helpers (installed via addInitScript-free evaluate) ----------
const HELPERS = () => {
  const W = window;
  W.__parse = (c) => {
    if (!c) return null;
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  W.__lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  W.__ratio = (a, b) => { const l1 = W.__lum(a), l2 = W.__lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  W.__blend = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
  // effective background: returns {color, uncertain}
  W.__effBg = (el) => {
    const layers = [];
    let uncertain = false;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') { uncertain = true; break; }
      const c = W.__parse(cs.backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    let col = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) col = W.__blend(layers[i], col);
    return { color: col, uncertain };
  };
  W.__path = (el) => {
    if (!el || el.nodeType !== 1) return String(el);
    const parts = [];
    for (let n = el; n && n.nodeType === 1 && n !== document.documentElement; n = n.parentElement) {
      let s = n.tagName.toLowerCase();
      if (n.id) { s += '#' + n.id; parts.unshift(s); break; }
      const cls = [...n.classList].slice(0, 2).map((c) => '.' + c).join('');
      s += cls;
      const idx = n.parentElement ? [...n.parentElement.children].indexOf(n) + 1 : 1;
      if (n.parentElement && n.parentElement.children.length > 1) s += `:nth-child(${idx})`;
      parts.unshift(s);
      if (n.tagName === 'BODY') break;
    }
    return parts.join(' > ');
  };
  W.__label = (el) => {
    if (!el || el.nodeType !== 1) return String(el);
    const t = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''} "${t}"`;
  };
  let vid = 0;
  W.__tag = () => { document.querySelectorAll('*').forEach((e) => { if (e.__vid === undefined) e.__vid = ++vid; }); };
  W.__tag();
  W.__visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.opacity === '0') return false;
    }
    return getComputedStyle(el).visibility !== 'hidden';
  };
  W.__tabbables = () => [...document.querySelectorAll('a[href],button,input,select,textarea,summary,[tabindex],[contenteditable]')]
    .filter((e) => e.tabIndex >= 0 && !e.disabled && !e.closest('[inert]') && W.__visible(e));
  W.__focusStyles = (el) => {
    const cs = getComputedStyle(el);
    const adj = W.__effBg(el.parentElement || el);
    return {
      outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, outlineColor: cs.outlineColor, outlineOffset: cs.outlineOffset,
      boxShadow: cs.boxShadow, border: [cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor].join('|'),
      borderWidths: [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].join('|'),
      backgroundColor: cs.backgroundColor, textDecoration: cs.textDecorationLine, adjBg: adj.color, adjUncertain: adj.uncertain,
    };
  };
};

const NATIVE_SEL = 'button, a[href], input, select, textarea, summary, [contenteditable]:not([contenteditable="false"])';

function judgeIndicator(before, after, ratio) {
  const reasons = [];
  const P = parseColor;
  // (a)
  if (after.outlineStyle !== 'none' && parseFloat(after.outlineWidth) >= 1) {
    const oc = P(after.outlineColor);
    if (oc && oc.a > 0) {
      const r = ratio(blend(oc, after.adjBg), after.adjBg);
      if (r >= 3) reasons.push(`a:outline ${after.outlineStyle} ${after.outlineWidth} ${after.outlineColor} ratio ${r.toFixed(2)}`);
      else reasons.push(`a-FAIL:outline ${after.outlineColor} vs adj ratio ${r.toFixed(2)}`);
    }
  }
  // (b)
  if (before && after.boxShadow !== before.boxShadow && after.boxShadow !== 'none') {
    const cols = [...after.boxShadow.matchAll(/rgba?\([^)]+\)/g)].map((m) => P(m[0])).filter((c) => c && c.a > 0);
    const best = Math.max(0, ...cols.map((c) => ratio(blend(c, after.adjBg), after.adjBg)));
    if (best >= 3) reasons.push(`b:box-shadow ratio ${best.toFixed(2)}`); else reasons.push(`b-FAIL:box-shadow ratio ${best.toFixed(2)}`);
  }
  // (c)
  if (before && after.border !== before.border) {
    const bs = before.border.split('|').map(P), as = after.border.split('|').map(P);
    const best = Math.max(0, ...as.map((c, i) => (c && bs[i] ? ratio(blend(c, after.adjBg), blend(bs[i], after.adjBg)) : 0)));
    if (best >= 3) reasons.push(`c:border ratio ${best.toFixed(2)}`); else reasons.push(`c-FAIL:border ratio ${best.toFixed(2)}`);
  }
  if (before && after.backgroundColor !== before.backgroundColor) {
    const r = ratio(blend(P(after.backgroundColor), after.adjBg), blend(P(before.backgroundColor), after.adjBg));
    if (r >= 3) reasons.push(`c:bg ratio ${r.toFixed(2)}`); else reasons.push(`c-FAIL:bg ratio ${r.toFixed(2)}`);
  }
  // (d)
  if (before && after.textDecoration !== before.textDecoration) reasons.push(`d:text-decoration ${before.textDecoration}->${after.textDecoration}`);
  const visible = reasons.some((r) => /^[abcd]:/.test(r));
  return { visible, reasons };
}
function parseColor(c) {
  if (!c) return null;
  if (typeof c === 'object') return c;
  const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null;
  const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
  return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
}
function lum(c) { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); }
function ratio(a, b) { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }
function blend(top, bot) { if (!top) return bot; return { r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 }; }

async function vidOfBackend(cdp, backendNodeId) {
  try {
    const { object } = await cdp.send('DOM.resolveNode', { backendNodeId });
    const r = await cdp.send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: 'function(){const e=this.nodeType===1?this:this.parentElement;return e?{vid:e.__vid,path:window.__path(e),label:window.__label(e),isEl:this.nodeType===1}:null}', returnByValue: true });
    return r.result.value;
  } catch (e) { return null; }
}

async function tabWalk(page, label) {
  // transitions/animations disabled before reading focus styles
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
  await page.evaluate(() => window.__tag());
  const walkStartedAtMs = Date.now();
  const startActive = await page.evaluate(() => window.__label(document.activeElement));
  const tabbablesAtStart = await page.evaluate(() => window.__tabbables().map((e) => e.__vid));
  const cap = tabbablesAtStart.length * 2 + 10;
  // baseline (unfocused) styles for all tabbables except active element
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
      return { vid: a.__vid, path: window.__path(a), label: window.__label(a), styles: window.__focusStyles(a), fv: a.matches(':focus-visible'), rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], prevStyles };
    }, prevVid);
    if (prevVid != null && info.prevStyles && !baseline[prevVid]) baseline[prevVid] = info.prevStyles;
    if (info.body) { endReason = 'body'; steps.push({ step: s + 1, body: true }); break; }
    steps.push({ step: s + 1, seg: segIdx, ...info, prevStyles: undefined });
    prevVid = info.vid;
    if (segment.has(info.vid)) {
      const firstIdx = segment.get(info.vid);
      const segSteps = steps.filter((x) => x.seg === segIdx && !x.body);
      const cyc = segSteps.slice(firstIdx).map((x) => x.vid);
      const cycSet = new Set(cyc);
      const nowTabbables = await page.evaluate(() => window.__tabbables().map((e) => e.__vid));
      const allVisited = nowTabbables.every((v) => visited.has(v));
      if (allVisited) { cycles.push({ members: [...cycSet], allVisited: true }); endReason = 'cycle-includes-all-focusables'; break; }
      await page.keyboard.press('Escape'); await page.waitForTimeout(50);
      const afterEsc = await page.evaluate(() => window.__label(document.activeElement));
      await page.keyboard.press('Shift+Tab'); await page.waitForTimeout(50);
      const after = await page.evaluate(() => { const a = document.activeElement; return { vid: a && a !== document.body ? a.__vid : null, label: window.__label(a), path: window.__path(a) }; });
      const memberLabels = await page.evaluate((ids) => ids.map((id) => window.__label([...document.querySelectorAll('*')].find((e) => e.__vid === id))), [...cycSet]);
      const container = await page.evaluate((ids) => {
        const els = ids.map((id) => [...document.querySelectorAll('*')].find((e) => e.__vid === id));
        let anc = els[0];
        while (anc && !els.every((e) => anc.contains(e))) anc = anc.parentElement;
        const dlg = els[0].closest('[role=dialog],[aria-modal=true],dialog');
        return { commonAncestor: window.__path(anc), dialog: dlg ? window.__path(dlg) : null };
      }, [...cycSet]);
      const escaped = after.vid == null ? true : !cycSet.has(after.vid);
      cycles.push({ atStep: s + 1, members: memberLabels, container, afterEscape: afterEsc, afterShiftTab: after.label, escapable: escaped });
      if (escaped) { segIdx++; segment = new Map(); prevVid = after.vid; if (after.vid != null) { segment.set(after.vid, 0); } continue; }
      endReason = 'trap-declared'; break;
    }
    segment.set(info.vid, steps.filter((x) => x.seg === segIdx && !x.body).length - 1);
    visited.add(info.vid);
  }
  return { walkStartedAtMs, startActive, focusableCount: tabbablesAtStart.length, cap, steps, cycles, endReason, baseline };
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
    const r = await cdp.send('Runtime.callFunctionOn', { objectId, returnByValue: true, functionDeclaration: `function(){
      const NATIVE=${JSON.stringify(NATIVE_SEL)};
      const role=(this.getAttribute('role')||'').trim();
      return {vid:this.__vid,path:window.__path(this),label:window.__label(this),role,tabIndex:this.tabIndex,
        native:this.matches(NATIVE), insideNative: !!(this.parentElement && this.parentElement.closest(NATIVE)), containsNative: !!this.querySelector(NATIVE),
        cursor:getComputedStyle(this).cursor}; }` });
    hits.push({ ...r.result.value, types });
  }
  // window/document delegated
  const winDoc = [];
  for (const expr of ['window', 'document']) {
    const { result: o } = await cdp.send('Runtime.evaluate', { expression: expr });
    const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: o.objectId, depth: 0 });
    winDoc.push({ target: expr, types: listeners.map((l) => l.type) });
  }
  const qualifying = hits.filter((h) => !walkVids.has(h.vid) && !INTERACTIVE.includes(h.role) && !h.native && !h.insideNative && !h.containsNative);
  // outermost rule
  const ancestry = await page.evaluate((ids) => {
    const map = {}; const all = [...document.querySelectorAll('*')];
    ids.forEach((id) => { const e = all.find((x) => x.__vid === id); map[id] = ids.filter((o) => o !== id && all.find((x) => x.__vid === o).contains(e)); });
    return map;
  }, qualifying.map((q) => q.vid));
  const outer = qualifying.filter((q) => ancestry[q.vid].length === 0);
  return { allWithListeners: hits, qualifying: outer, suppressedChildren: qualifying.filter((q) => ancestry[q.vid].length > 0).map((q) => q.label), windowDocListeners: winDoc };
}

async function auditPage(browser, name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  await page.goto(BASE + name, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.evaluate(HELPERS);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('DOM.enable'); await cdp.send('Accessibility.enable');
  await cdp.send('DOM.getDocument', { depth: -1 });
  const res = { page: name, hauntings: {}, notes: {} };

  // ---- AX tree ----
  const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  const ax = [];
  for (const n of nodes) {
    if (n.backendDOMNodeId == null) continue;
    const role = n.role?.value; const name = (n.name?.value || '').trim();
    ax.push({ n, role, name, ignored: n.ignored });
  }
  // Nameless Spirit
  const ns = [];
  for (const a of ax) if (!a.ignored && INTERACTIVE.includes(a.role) && a.name === '') { const v = await vidOfBackend(cdp, a.n.backendDOMNodeId); ns.push({ role: a.role, ...v }); }
  res.hauntings.NamelessSpirit = ns;
  // Hollow Portrait
  const hp = []; const unnamedImageNodes = [];
  for (const a of ax) {
    if (a.ignored || !['img', 'image'].includes(a.role) || a.name !== '') continue;
    const v = await vidOfBackend(cdp, a.n.backendDOMNodeId);
    const d = await page.evaluate((vid) => {
      const e = [...document.querySelectorAll('*')].find((x) => x.__vid === vid);
      const role = e.getAttribute('role');
      const ctl = e.parentElement && e.parentElement.closest('button,a[href]');
      const soleContent = ctl ? ctl.textContent.trim() === '' && ctl.querySelectorAll('img,svg').length === 1 : false;
      return { tag: e.tagName.toLowerCase(), alt: e.getAttribute('alt'), role, ariaHidden: !!e.closest('[aria-hidden=true]'), soleContent, src: e.getAttribute('src') };
    }, v.vid);
    unnamedImageNodes.push({ ...v, ...d });
    if (d.alt === '' || ['presentation', 'none'].includes(d.role) || d.ariaHidden) continue;
    if (d.tag === 'svg' && d.role !== 'img') continue;
    if (d.soleContent) continue; // parent is the Nameless Spirit
    hp.push({ ...v, ...d });
  }
  res.hauntings.HollowPortrait = hp;
  res.notes.unnamedImageAXNodes = unnamedImageNodes.map((x) => `${x.tag} ${x.path} alt=${JSON.stringify(x.alt)} role=${x.role}`);
  // Whispering Field
  const wf = []; const fieldsAll = [];
  for (const a of ax) {
    if (a.ignored || !FIELD_ROLES.includes(a.role)) continue;
    const v = await vidOfBackend(cdp, a.n.backendDOMNodeId);
    const srcs = (a.n.name?.sources || []);
    const winning = srcs.find((s) => !s.superseded && s.value && String(s.value.value || '').trim() !== '' );
    const wsrc = winning ? (winning.attribute || winning.nativeSource || winning.type) : null;
    fieldsAll.push({ role: a.role, name: a.name, winning: wsrc, path: v.path, sources: srcs.map((s) => `${s.type}${s.attribute ? ':' + s.attribute : ''}${s.nativeSource ? ':' + s.nativeSource : ''}=${JSON.stringify(s.value?.value ?? '')}${s.superseded ? '(superseded)' : ''}`) });
    if (a.name === '' || wsrc === 'placeholder') wf.push({ role: a.role, name: a.name, kind: a.name === '' ? 'empty' : 'placeholder-only', ...v });
  }
  res.hauntings.WhisperingField = wf;
  res.notes.fields = fieldsAll;
  // landmarks
  const landmarks = ax.filter((a) => !a.ignored && ['main', 'banner', 'contentinfo', 'navigation', 'complementary', 'region', 'form', 'search'].includes(a.role)).map((a) => a.role);
  res.notes.landmarks = landmarks;

  // ---- Silent Tongue ----
  const lang = await page.evaluate(() => document.documentElement.getAttribute('lang'));
  res.hauntings.SilentTongue = (lang == null || !/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(lang)) ? [{ path: 'html', label: `lang=${JSON.stringify(lang)}` }] : [];

  // ---- Shattered Order ----
  const heads = await page.evaluate(() => [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => ({ lvl: +h.tagName[1], vid: h.__vid, path: window.__path(h), label: window.__label(h) })));
  const so = [];
  if (!heads.some((h) => h.lvl === 1)) so.push({ kind: 'no-h1', path: 'document' });
  for (let i = 1; i < heads.length; i++) if (heads[i].lvl > heads[i - 1].lvl + 1) so.push({ kind: 'heading-skip', from: heads[i - 1].lvl, to: heads[i].lvl, ...heads[i] });
  if (!landmarks.includes('main')) so.push({ kind: 'no-main', path: 'document' });
  res.hauntings.ShatteredOrder = so;
  res.notes.headings = heads.map((h) => `h${h.lvl} ${h.label}`);

  // ---- The Veiled ----
  const veiled = await page.evaluate(() => {
    const out = []; const docW = document.documentElement.scrollWidth, docH = document.documentElement.scrollHeight;
    const roots = [...document.querySelectorAll('[aria-hidden=true],[role=presentation],[role=none]')].filter((e) => !e.parentElement.closest('[aria-hidden=true],[role=presentation],[role=none]'));
    for (const e of roots) {
      if (e.tagName === 'IMG' && e.getAttribute('alt') === '') continue;
      const r = e.getBoundingClientRect();
      const x = r.left + scrollX, y = r.top + scrollY;
      const intersects = r.width > 0 && r.height > 0 && x + r.width > 0 && y + r.height > 0 && x < docW && y < docH;
      const vis = window.__visible(e) && intersects;
      const focusables = [...e.querySelectorAll('a[href],button,input,select,textarea,[tabindex]')].filter((f) => f.tabIndex >= 0 && !f.disabled);
      if (e.matches('a[href],button,input,select,textarea,[tabindex]') && e.tabIndex >= 0) focusables.push(e);
      // visible text
      let text = '';
      const tw = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
      while (tw.nextNode()) { const t = tw.currentNode; if (t.textContent.trim() && t.parentElement && window.__visible(t.parentElement)) text += t.textContent.trim() + ' '; }
      out.push({ path: window.__path(e), vid: e.__vid, ariaHidden: e.getAttribute('aria-hidden'), role: e.getAttribute('role'), visible: vis, rect: [Math.round(x), Math.round(y), Math.round(r.width), Math.round(r.height)], text: text.trim().slice(0, 60), focusables: focusables.map((f) => window.__label(f)) });
    }
    return out;
  });
  res.notes.hiddenRoots = veiled;
  res.hauntings.TheVeiled = veiled.filter((v) => (v.focusables.length > 0) || (v.visible && v.text));

  // ---- axe ----
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  res.axe = { violations: Object.fromEntries(axe.violations.map((v) => [v.id, v.nodes.map((n) => n.target.join(' ') + (n.any?.[0]?.data?.contrastRatio ? ` (${n.any[0].data.contrastRatio})` : ''))])), incomplete: Object.fromEntries(axe.incomplete.map((v) => [v.id, v.nodes.map((n) => n.target.join(' '))])) };
  const axeBP = await new AxeBuilder({ page }).withRules(['heading-order']).analyze();
  res.axe.headingOrder = axeBP.violations.map((v) => v.nodes.map((n) => n.target.join(' '))).flat();

  // ---- The Fog: own per-text-element contrast walk ----
  const fogOwn = await page.evaluate(() => {
    const out = []; const unc = [];
    for (const el of document.querySelectorAll('body *')) {
      if (['SCRIPT', 'STYLE', 'svg', 'SVG', 'OPTION'].includes(el.tagName) || el.closest('svg')) continue;
      const hasText = [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim());
      if (!hasText || !window.__visible(el)) continue;
      if (el.closest('[aria-disabled=true]') || el.matches(':disabled')) continue;
      const cs = getComputedStyle(el);
      const fg = window.__parse(cs.color);
      const bg = window.__effBg(el);
      if (bg.uncertain) { unc.push(window.__path(el)); continue; }
      const fgc = window.__blend(fg, bg.color);
      const r = window.__ratio(fgc, bg.color);
      const size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight) >= 700;
      const large = size >= 24 || (bold && size >= 18.66);
      const need = large ? 3 : 4.5;
      if (r < need) out.push({ vid: el.__vid, path: window.__path(el), label: window.__label(el), ratio: +r.toFixed(2), fg: cs.color, size, inAriaHidden: !!el.closest('[aria-hidden=true]') });
    }
    return { fails: out, uncertain: unc };
  });
  res.hauntings.TheFog = fogOwn.fails;
  res.notes.fogUncertain = fogOwn.uncertain;

  // ---- Tab walk ----
  const walk = await tabWalk(page, name);
  const walkVids = new Set(walk.steps.filter((s) => !s.body).map((s) => s.vid));
  const iw = []; const iwChecked = [];
  const seenIW = new Set();
  for (const s of walk.steps) {
    if (s.body || seenIW.has(s.vid)) continue; seenIW.add(s.vid);
    const before = walk.baseline[s.vid] || null;
    const j = judgeIndicator(before, s.styles, ratio);
    iwChecked.push({ label: s.label, visible: j.visible, reasons: j.reasons, hadBaseline: !!before });
    if (!j.visible) iw.push({ vid: s.vid, path: s.path, label: s.label, reasons: j.reasons, outline: `${s.styles.outlineStyle} ${s.styles.outlineWidth} ${s.styles.outlineColor} off ${s.styles.outlineOffset}` });
  }
  res.hauntings.InvisibleWanderer = iw;
  res.notes.iwChecked = iwChecked;
  res.walk = { walkStartedAtMs: walk.walkStartedAtMs, startActive: walk.startActive, focusableCount: walk.focusableCount, cap: walk.cap, endReason: walk.endReason, sequence: walk.steps.map((s) => (s.body ? `${s.step}: <body>` : `${s.step}[seg${s.seg}]: ${s.label}`)), cycles: walk.cycles };
  res.hauntings.CursedLoop = walk.cycles.filter((c) => c.escapable === false && !c.allVisited).map((c) => ({ path: c.container.dialog || c.container.commonAncestor, container: c.container, members: c.members }));

  // ---- Lost Soul ----
  const ls = await lostSouls(page, cdp, walkVids);
  res.hauntings.LostSoul = ls.qualifying;
  res.notes.listeners = ls.allWithListeners.map((h) => `${h.label} [${h.types}] native=${h.native} insideNative=${h.insideNative} containsNative=${h.containsNative} inWalk=${walkVids.has(h.vid)} role=${h.role} cursor=${h.cursor}`);
  res.notes.windowDocListeners = ls.windowDocListeners;
  res.notes.lostSoulSuppressed = ls.suppressedChildren;

  // ---- golden comparison ----
  const g = golden[name];
  res.compare = {};
  res.selectorChecks = {};
  for (const key of ['NamelessSpirit', 'HollowPortrait', 'TheFog', 'LostSoul', 'CursedLoop', 'InvisibleWanderer', 'WhisperingField', 'SilentTongue', 'ShatteredOrder', 'TheVeiled']) {
    const ge = g?.hauntings?.[key];
    const actual = res.hauntings[key] || [];
    const sels = ge?.selectors || [];
    const selInfo = await page.evaluate((sels) => sels.map((s) => { let els = []; try { els = [...document.querySelectorAll(s)]; } catch (e) { return { s, err: String(e) }; } return { s, n: els.length, vids: els.map((e) => e.__vid), label: els[0] ? window.__label(els[0]) : null }; }), sels);
    const actualVids = new Set(actual.map((a) => a.vid).filter((v) => v != null));
    const matched = selInfo.filter((si) => si.vids && si.vids.some((v) => actualVids.has(v)));
    const goldenVids = new Set(selInfo.flatMap((si) => si.vids || []));
    const unexpected = actual.filter((a) => a.vid == null ? false : !goldenVids.has(a.vid));
    res.compare[key] = {
      goldenCount: ge ? ge.count : 'MISSING', selectorsLen: sels.length, actualCount: actual.length,
      badSelectors: selInfo.filter((si) => si.n !== 1).map((si) => `${si.s} -> matches ${si.n ?? si.err}`),
      goldenNotFired: selInfo.filter((si) => !(si.vids || []).some((v) => actualVids.has(v))).map((si) => `${si.s} (${si.label})`),
      actualNotInGolden: unexpected.map((a) => `${a.path} ${a.label || ''} ${a.kind || ''}`.trim()),
    };
  }
  // controls
  res.controls = {};
  for (const [k, c] of Object.entries(g?.controls || {})) {
    const sels = c.selectors || [];
    const info = await page.evaluate((sels) => sels.map((s) => { try { const els = [...document.querySelectorAll(s)]; return { s, n: els.length, vids: els.map((e) => e.__vid) }; } catch (e) { return { s, err: String(e) }; } }), sels);
    const flagged = [];
    for (const si of info) for (const v of si.vids || []) for (const [hk, arr] of Object.entries(res.hauntings)) if (arr.some((a) => a.vid === v)) flagged.push(`${si.s} flagged as ${hk}`);
    res.controls[k] = { description: c.description, matches: info.map((i) => `${i.s}:${i.n ?? i.err}`), flagged };
  }
  res.consoleErrors = consoleErrors;
  await page.screenshot({ path: OUT + name.replace('.html', '') + '-1280-after-walk.png' });
  await ctx.close();
  return res;
}

const browser = await chromium.launch({ channel: process.env.UNSEEN_CHROMIUM_CHANNEL || 'chromium' });
const all = {};
for (const p of PAGES) { all[p] = await auditPage(browser, p); console.error('done', p); }
await browser.close();
fs.writeFileSync(OUT + 'report.json', JSON.stringify(all, (k, v) => (k === 'baseline' ? undefined : v), 2));
for (const [p, r] of Object.entries(all)) {
  console.log(`\n===== ${p}`);
  for (const [k, c] of Object.entries(r.compare)) console.log(`${k.padEnd(18)} golden=${c.goldenCount} sels=${c.selectorsLen} actual=${c.actualCount}${c.badSelectors.length ? ' BADSEL:' + JSON.stringify(c.badSelectors) : ''}${c.goldenNotFired.length ? ' NOTFIRED:' + JSON.stringify(c.goldenNotFired) : ''}${c.actualNotInGolden.length ? ' EXTRA:' + JSON.stringify(c.actualNotInGolden) : ''}`);
}
