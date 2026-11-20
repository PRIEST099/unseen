import { chromium } from 'playwright';
import { fileURLToPath as __f2p, pathToFileURL as __p2u } from 'node:url';
import __path from 'node:path'; import __os from 'node:os'; import __fs from 'node:fs';
const __REPO = __path.resolve(__path.dirname(__f2p(import.meta.url)), '../../../..');
__fs.mkdirSync(process.env.PROBE_OUT ?? __path.join(__os.tmpdir(), 'unseen-probes'), { recursive: true });
const OUT = (process.env.PROBE_OUT ?? __path.join(__os.tmpdir(), 'unseen-probes')) + '/';
const BASE = __p2u(__path.join(__REPO, 'apps/cursed-shop')).href + '/';
const browser = await chromium.launch({ channel: process.env.UNSEEN_CHROMIUM_CHANNEL || 'chromium' });
const log = (...a) => console.log(...a);

async function open(name, vp = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('dialog', (d) => { errs.push('dialog:' + d.message()); d.dismiss().catch(() => {}); });
  await page.goto(BASE + name, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  return { ctx, page, errs };
}
const state = (page) => page.evaluate(() => {
  const m = document.getElementById('newsletterModal');
  const a = document.activeElement;
  return { modalActive: m ? m.classList.contains('active') : null, modalVisible: m ? getComputedStyle(m).display !== 'none' && getComputedStyle(m).visibility !== 'hidden' && getComputedStyle(m).opacity !== '0' : null,
    focus: a ? `${a.tagName.toLowerCase()}${a.id ? '#' + a.id : ''}.${a.className} "${(a.textContent || a.placeholder || '').trim().slice(0, 25)}"` : 'null',
    focusInModal: !!(m && a && m.contains(a)) };
});

// ---------- CHECKOUT TRUE TRAP ----------
log('=== CHECKOUT trap tests ===');
{
  const { ctx, page } = await open('checkout.html');
  log('after networkidle+1500:', JSON.stringify(await state(page)));
  const fwd = [];
  for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); fwd.push((await state(page)).focus); }
  log('Tab x12:', fwd.join(' -> '));
  const back = [];
  for (let i = 0; i < 8; i++) { await page.keyboard.press('Shift+Tab'); back.push((await state(page)).focus); }
  log('Shift+Tab x8:', back.join(' -> '));
  await page.keyboard.press('Escape'); log('Escape:', JSON.stringify(await state(page)));
  await page.keyboard.press('Shift+Tab'); log('Escape then Shift+Tab:', JSON.stringify(await state(page)));
  await ctx.close();
}
// distinct focusables reached in modal: try Enter and Space on each
const targets = ['input', 'No thanks', 'Subscribe', 'Close modal / ×'];
for (let k = 0; k < 4; k++) {
  for (const key of ['Enter', 'Space']) {
    const { ctx, page, errs } = await open('checkout.html');
    for (let i = 0; i < k; i++) await page.keyboard.press('Tab');
    const before = await state(page);
    await page.keyboard.press(key);
    await page.waitForTimeout(300);
    const after = await state(page);
    log(`Tab x${k} -> focus ${before.focus} ; press ${key} -> modalActive=${after.modalActive} focus=${after.focus} inModal=${after.focusInModal}${errs.length ? ' ' + errs.join('|') : ''}`);
    if (!after.modalActive) {
      await page.keyboard.press('Tab'); log('     next Tab after close lands on:', (await state(page)).focus);
    }
    await ctx.close();
  }
}
// email typed + Enter
{
  const { ctx, page, errs } = await open('checkout.html');
  await page.keyboard.type('a@b.co'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  log('type email + Enter ->', JSON.stringify(await state(page)), errs.join('|'));
  await ctx.close();
}
// Tab-from-body start
{
  const { ctx, page } = await open('checkout.html');
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('Tab'); log('blur then first Tab from body ->', JSON.stringify(await state(page)));
  await ctx.close();
}
// aria-modal: background AX nodes still exposed?
{
  const { ctx, page } = await open('checkout.html');
  const snap = await page.accessibility?.snapshot?.().catch(() => null);
  const cdp = await ctx.newCDPSession(page);
  const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  const named = nodes.filter((n) => !n.ignored && n.role?.value === 'textbox').map((n) => n.name?.value);
  log('non-ignored textboxes while modal open:', named.length, JSON.stringify(named));
  await ctx.close();
}

// ---------- INDEX cookie banner ----------
log('\n=== INDEX cookie banner ===');
{
  const { ctx, page } = await open('index.html');
  const info = await page.evaluate(() => {
    const b = document.getElementById('cookieBanner') || document.querySelector('.cookie-banner,[class*=cookie]');
    return { exists: !!b, markup: b ? b.outerHTML.slice(0, 300) : null, anyCookieText: /cookie/i.test(document.body.innerText) };
  });
  log(JSON.stringify(info));
  await ctx.close();
}

// ---------- mobile + CTA ----------
log('\n=== layout ===');
for (const name of ['index.html', 'product.html', 'checkout.html']) {
  const { ctx, page, errs } = await open(name, { width: 390, height: 844 });
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  await page.screenshot({ path: OUT + name.replace('.html', '') + '-390.png' });
  log(`${name} 390px scrollWidth=${sw} errors=${JSON.stringify(errs)}`);
  await ctx.close();
}
{
  const { ctx, page } = await open('checkout.html');
  await page.screenshot({ path: OUT + 'checkout-1280-modal.png' });
  await page.mouse.click(5, 5); // overlay click closes modal
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => { const b = document.querySelector('.checkout-btn'); const rc = b.getBoundingClientRect(); const e = document.elementFromPoint(rc.x + rc.width / 2, rc.y + rc.height / 2); return { rect: [rc.x, rc.y, rc.width, rc.height].map(Math.round), hit: e ? e.className : null, modalActive: document.getElementById('newsletterModal').classList.contains('active') }; });
  log('checkout CTA after overlay click:', JSON.stringify(r));
  await page.screenshot({ path: OUT + 'checkout-1280-nomodal.png' });
  await ctx.close();
}
// View Cart button path
for (const name of ['index.html', 'product.html', 'checkout.html']) {
  const { ctx, page } = await open(name);
  if (name === 'checkout.html') { await page.mouse.click(5, 5); await page.waitForTimeout(300); }
  await page.click('.nav-icons .icon-btn:nth-child(2)');
  await page.waitForTimeout(500);
  log(`${name}: click View Cart -> url ${page.url().split('/').pop()}`);
  await ctx.close();
}
// index hero button focus screenshot + product footer link focus
{
  const { ctx, page } = await open('index.html');
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
  for (let i = 0; i < 8; i++) await page.keyboard.press('Tab');
  const el = await page.$('.hero .btn');
  const box = await el.boundingBox();
  await page.screenshot({ path: OUT + 'index-hero-btn-focused.png', clip: { x: box.x - 20, y: box.y - 20, width: box.width + 40, height: box.height + 40 } });
  log('index focused after 8 Tabs:', await page.evaluate(() => document.activeElement.className + ' outline=' + getComputedStyle(document.activeElement).outline + ' parentBg=' + getComputedStyle(document.activeElement.parentElement).backgroundColor));
  await ctx.close();
}
{
  const { ctx, page } = await open('product.html');
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
  await page.focus('.footer-col:nth-child(2) li:nth-child(1) a');
  await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
  const el = await page.$('.footer-col:nth-child(2) li:nth-child(1) a');
  const box = await el.boundingBox();
  await page.screenshot({ path: OUT + 'product-footer-link-focused.png', clip: { x: box.x - 20, y: box.y - 15, width: box.width + 40, height: box.height + 30 } });
  log('product footer link:', await page.evaluate(() => getComputedStyle(document.activeElement).outline + ' fv=' + document.activeElement.matches(':focus-visible') + ' footerBg=' + getComputedStyle(document.querySelector('footer')).backgroundColor));
  await ctx.close();
}
await browser.close();
