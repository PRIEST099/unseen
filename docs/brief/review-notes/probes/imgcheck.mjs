import { chromium } from 'playwright';
import { fileURLToPath as __f2p, pathToFileURL as __p2u } from 'node:url';
import __path from 'node:path'; import __os from 'node:os'; import __fs from 'node:fs';
const __REPO = __path.resolve(__path.dirname(__f2p(import.meta.url)), '../../../..');
__fs.mkdirSync(process.env.PROBE_OUT ?? __path.join(__os.tmpdir(), 'unseen-probes'), { recursive: true });
const b = await chromium.launch({ channel: process.env.UNSEEN_CHROMIUM_CHANNEL || 'chromium' });
for (const n of ['index.html','product.html','checkout.html']) {
  const p = await b.newPage({ viewport:{width:1280,height:900} });
  await p.goto(__p2u(__path.join(__REPO, 'apps/cursed-shop')).href + '/'+n, { waitUntil: 'networkidle' });
  await p.evaluate(async () => { for (const i of document.images) { i.loading='eager'; i.scrollIntoView(); await new Promise(r=>setTimeout(r,50)); } });
  await p.waitForTimeout(800);
  const r = await p.evaluate(() => [...document.images].map(i => `${i.getAttribute('src')} complete=${i.complete} naturalWidth=${i.naturalWidth}`));
  console.log(n, '\n  ' + r.join('\n  '));
  if (n==='index.html') { await p.evaluate(()=>document.querySelector('.product-grid').scrollIntoView()); await p.screenshot({ path: __path.join(process.env.PROBE_OUT ?? __path.join(__os.tmpdir(), 'unseen-probes'), 'index-grid.png') }); }
  await p.close();
}
await b.close();
