import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium, webkit, devices } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = resolve(process.env.SITE_DIR || '.');
const prefix = '/dronehub-preview/';
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.woff2':'font/woff2' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (!pathname.startsWith(prefix)) { res.writeHead(404).end(); return; }
    const path = resolve(root, pathname.slice(prefix.length) || 'index.html');
    if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    const bytes = await readFile(path);
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream' });
    res.end(bytes);
  } catch { if (!res.headersSent) res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}${prefix}`;
await mkdir('test-results', { recursive: true });
const report = [];
const chosen = (process.env.BROWSERS || 'chromium,webkit').split(',');
const scenarios = [
  { name:'iphone-se', options:{ ...devices['iPhone SE'], viewport:{ width:375, height:667 } } },
  { name:'iphone-13', options:devices['iPhone 13'] },
  { name:'iphone-large', options:{ ...devices['iPhone 13'], viewport:{ width:430, height:932 } } },
  { name:'narrow-320', options:{ viewport:{ width:320, height:740 } } },
  { name:'desktop', options:{ viewport:{ width:1280, height:900 } } },
];
async function layout(page) {
  const sizes = await page.evaluate(() => ({ width:innerWidth, content:document.documentElement.scrollWidth }));
  assert.ok(sizes.content <= sizes.width + 1, `Horizontal overflow: ${JSON.stringify(sizes)}`);
}
const action = (page, name, value) => page.locator(`[data-action="${name}"]${value === undefined ? '' : `[data-value="${value}"]`}`);
async function journey(page, label) {
  const errors = [], failedAssets = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.url().startsWith(base) && r.status() >= 400) failedAssets.push(r.url()); });
  // Product photos are deliberately offline: the approved fallback must remain usable.
  await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
  assert.equal((await page.goto(base)).status(), 200);
  await action(page, 'goGuide').waitFor();
  await layout(page);
  const startBox = await action(page, 'goGuide').boundingBox();
  assert.ok(startBox.height >= 44 && startBox.y + startBox.height < page.viewportSize().height, 'Start action must be visible and tappable on first screen');
  await page.screenshot({ path:`test-results/${label}-home.png`, fullPage:true });
  await action(page, 'goCatalogSearch').click();
  const search = page.locator('#catalogSearch');
  assert.ok(await search.evaluate(e => e === document.activeElement), 'Search must receive focus');
  assert.equal(await page.locator('[data-catalog-id]').count(), 10);
  for (const weight of await page.locator('[data-catalog-id] .spec .ok').allTextContents()) {
    const number = Number(weight.match(/[\d]+(?:[.,]\d+)?/)?.[0]?.replace(',', '.'));
    assert.ok(number > 0 && number < 250, `Weight outside approved range: ${weight}`);
  }
  await search.fill('DJI Mini 4 Pro');
  assert.equal(await page.locator('[data-catalog-id]:visible').count(), 1);
  await search.fill('ingen-match-123');
  assert.equal(await page.locator('[data-catalog-id]:visible').count(), 0);
  assert.ok(await page.locator('#catalogEmpty').isVisible());
  await search.fill('');
  assert.ok(await action(page, 'showCompare').isDisabled());
  await action(page, 'compareToggle', 'mini4pro').click();
  assert.ok(await action(page, 'showCompare').isDisabled());
  await action(page, 'compareToggle', 'flip').click();
  await action(page, 'showCompare').click();
  assert.equal(await page.locator('.compareGrid > article').count(), 2);
  assert.equal(await page.locator('.compareRow').count(), 9);
  assert.match(await page.locator('.compareRows').textContent(), /Plus|standardbatteri/);
  await layout(page);
  await page.screenshot({ path:`test-results/${label}-compare.png`, fullPage:true });
  await page.locator('[data-nav="guide"]').click();
  await action(page, 'budget', '4000').click();
  await action(page, 'screen', 'yes').click();
  await action(page, 'priority', 'safety').click();
  await action(page, 'rth', 'yes').click();
  assert.match(await page.locator('#app').textContent(), /4[.\s]?000 kr/);
  assert.match(await page.locator('#app').textContent(), /ikke.*verificeret|ingen.*garanterede/i);
  await layout(page);
  await page.locator('[data-nav="catalog"]').click();
  await action(page, 'selectModel', 'mini4pro').click();
  const amounts = { drone:'3000', controller:'500', extras:'400', shipping:'100' };
  for (const [key, value] of Object.entries(amounts)) await page.locator(`#amount_${key}`).fill(value);
  assert.match(await page.locator('#priceResult').textContent(), /4[.\s]?000 kr/);
  assert.ok(await page.locator('#priceResult.safe').isVisible(), 'Exact budget must pass arithmetic check');
  await page.locator('#amount_shipping').fill('101');
  assert.ok(await page.locator('#priceResult.warn').isVisible(), 'Shipping must push total over budget');
  await page.locator('#amount_shipping').fill('');
  assert.ok(await page.locator('#priceResult.neutral').isVisible(), 'Unknown shipping must block budget acceptance');
  await page.locator('#amount_shipping').fill('-1');
  assert.match(await page.locator('#priceResult').textContent(), /ugyldige|negative/i);
  await layout(page);
  await page.screenshot({ path:`test-results/${label}-budget.png`, fullPage:true });
  await page.reload();
  await page.locator('[data-nav="guide"]').click();
  assert.ok(await action(page, 'budget', '4000').isVisible());
  assert.deepEqual(errors, [], 'JavaScript runtime errors');
  assert.deepEqual(failedAssets, [], 'Broken local assets under Pages subpath');
}
let failed = false;
try {
  for (const name of chosen) {
    const engine = { chromium, webkit }[name];
    assert.ok(engine, 'Unknown browser');
    const browser = await engine.launch({ headless:true });
    try {
      for (const scenario of scenarios) {
        const label = `${name}-${scenario.name}`;
        const context = await browser.newContext(scenario.options);
        const page = await context.newPage();
        try { await journey(page, label); report.push({ scenario:label, passed:true }); console.log(`PASS ${label}`); }
        catch (e) { failed = true; report.push({ scenario:label, passed:false, reason:e.message }); await page.screenshot({ path:`test-results/${label}-failure.png`, fullPage:true }).catch(() => {}); console.error(`FAIL ${label}: ${e.message}`); }
        finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
} finally {
  const { writeFile } = await import('node:fs/promises');
  await writeFile('test-results/acceptance.json', JSON.stringify({ emulated:true, realIPhoneVerified:false, results:report }, null, 2));
  await new Promise(r => server.close(r));
}
if (failed) process.exitCode = 1;
