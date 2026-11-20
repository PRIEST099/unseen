import { chromium } from 'playwright';
import axe from '@axe-core/playwright';

const pages = ['index.html', 'product.html', 'checkout.html'];
const port = 4173;

async function runVerification() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  
  for (const pageFile of pages) {
    console.log(`\n=== ${pageFile} ===\n`);
    
    const page = await context.newPage();
    await page.goto(`http://localhost:${port}/${pageFile}`, { waitUntil: 'networkidle' });
    
    // Run axe
    const results = await axe.run(page, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
      }
    });
    
    console.log('Axe violations:');
    for (const violation of results.violations) {
      console.log(`  - ${violation.id}: ${violation.help} (${violation.nodes.length} nodes)`);
    }
    
    await page.close();
  }
  
  await browser.close();
}

runVerification().catch(console.error);
