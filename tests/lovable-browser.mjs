import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium, webkit, devices } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = resolve(process.env.SITE_DIR || '../../pages-dist');
const prefix = '/dronehub-preview/';
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (!path.startsWith(prefix)) { res.writeHead(404).end(); return; }
    let file = resolve(root, path.slice(prefix.length) || 'index.html');
    if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    let bytes;
    try { bytes = await readFile(file); }
    catch {
      try { file = resolve(file, 'index.html'); bytes = await readFile(file); }
      catch { file = resolve(root, '404.html'); bytes = await readFile(file); res.statusCode = 404; }
    }
    res.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.ico':'image/x-icon'})[extname(file)] || 'application/octet-stream');
    res.end(bytes);
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}${prefix}`;
await mkdir('test-results', {recursive:true});
const results = [];
let failed = false;
async function layout(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Page must not overflow horizontally');
}
try {
  for (const engineName of (process.env.BROWSERS || 'chromium,webkit').split(',')) {
    const browser = await ({chromium,webkit}[engineName]).launch({headless:true});
    try {
      for (const width of (process.env.VIEWPORTS || '320,375,390,430,1280').split(',').map(Number)) {
        const context = await browser.newContext(width===1280 ? {viewport:{width,height:900}} : {...devices['iPhone 13'], viewport:{width,height:width===375?667:844}});
        const page = await context.newPage();
        const label = `${engineName}-${width}`;
        const errors = [], broken = [];
        page.on('pageerror', e => errors.push([page.url(), e.message, e.cause?.message].filter(Boolean).join(' | ')));
        page.on('response', r => { if (r.url().startsWith(base) && r.status()>=400 && /\.(js|css)(\?|$)/.test(r.url())) broken.push(r.url()); });
        await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
        try {
          await page.goto(base);
          const guide = page.getByRole('link',{name:'Hjælp mig med at vælge',exact:true});
          await guide.waitFor();
          await layout(page);
          const box = await guide.boundingBox();
          assert.ok(box.height>=44 && box.y+box.height < page.viewportSize().height, 'First action must be on first screen');
          await page.screenshot({path:`test-results/${label}-home.png`,fullPage:true});
          await page.getByRole('link',{name:'Find en bestemt drone',exact:true}).click();
          const search = page.getByLabel('Søg efter model eller mærke',{exact:true});
          await search.waitFor();
          assert.ok(await search.evaluate(e=>e===document.activeElement));
          await search.fill('DJI Mini 4 Pro');
          await page.getByRole('status').filter({hasText:'1 modeller fundet'}).waitFor();
          await search.fill('no-such-drone');
          await page.getByText('Ingen modeller matcher din søgning og dine filtre.',{exact:false}).waitFor();
          await search.fill('');
          await page.getByRole('button',{name:'Under 250 g',exact:true}).click();
          const names = await page.locator('main h2').allTextContents();
          assert.ok(names.length>0);
          assert.ok(!names.some(n=>/Air 3S|Mavic 3|Avata 2/.test(n)), 'Heavy models must be excluded');
          await layout(page);
          await page.getByRole('button',{name:'Tilføj til sammenligning',exact:true}).nth(0).click();
          await page.getByRole('button',{name:'Tilføj til sammenligning',exact:true}).nth(0).click();
          assert.equal(await page.locator('table thead th').count(),3);
          assert.equal(await page.locator('table tbody tr').count(),10);
          await layout(page);
          await page.screenshot({path:`test-results/${label}-compare.png`,fullPage:true});
          const scroller = page.locator('table').locator('..');
          assert.ok(await scroller.evaluate(e=>e.scrollWidth>=e.clientWidth));
          await page.getByRole('button',{name:'Tilføj til sammenligning',exact:true}).nth(0).click();
          assert.equal(await page.locator('table thead th').count(),4, 'Comparison supports three models');
          assert.ok(await page.getByRole('button',{name:'Tilføj til sammenligning',exact:true}).evaluateAll(buttons=>buttons.length>0 && buttons.every(b=>b.disabled)), 'A fourth model cannot be added');
          await layout(page);
          await page.screenshot({path:`test-results/${label}-compare-three.png`,fullPage:true});
          await page.locator('table thead th').last().getByRole('button',{name:/^Fjern /}).click();
          assert.equal(await page.locator('table thead th').count(),3, 'Removing a model updates comparison');
          assert.ok(await page.getByRole('button',{name:'Tilføj til sammenligning',exact:true}).nth(0).isEnabled(), 'Removing a model frees a comparison slot');
          const budget = page.getByLabel('Maks. budget i DKK',{exact:false});
          await budget.fill('100000');
          await page.getByRole('status').filter({hasText:'0 modeller fundet'}).waitFor();
          // Unknown legacy USD prices may never become a DKK match, at any budget.
          await page.goto(base+'guide');
          await page.getByRole('button',{name:'Lære at flyve',exact:false}).click();
          await page.getByLabel('Dit maksimale budget i DKK',{exact:true}).fill('4000');
          await page.getByRole('button',{name:'Fortsæt med mit budget',exact:true}).click();
          await page.getByRole('button',{name:'Sikkerhedsfunktioner',exact:false}).click();
          await page.getByRole('button',{name:'Et krav',exact:false}).click();
          await page.getByRole('button',{name:'Aldrig',exact:false}).click();
          await page.getByText('Ingen dokumenterede budgetmatch for de nuværende pakkevarianter',{exact:false}).waitFor();
          await layout(page);
          await page.screenshot({path:`test-results/${label}-budget.png`,fullPage:true});
          for (const path of ['catalog','guide','vaegt','scanner','blueprints','printlab','printlab/guide']) {
            const response = await page.goto(base+path+'/');
            assert.equal(response.status(),200,`Static route ${path}`);
            await page.locator('main').waitFor();
            await layout(page);
            await page.reload();
            await page.locator('main').waitFor();
          }
          for (const path of ['blueprints/src-opendrono','printlab/pp-controller-stand/','printlab/pp-controller-stand/fit']) {
            await page.goto(base+path);
            await page.waitForURL(url=>url.pathname.replace(/\/+$/,'')===new URL(base+path).pathname.replace(/\/+$/,'') && !url.searchParams.has('__pages_route'));
            await page.locator('main').waitFor();
            assert.doesNotMatch(await page.locator('main h1').textContent(),/404|not found|findes ikke/i);
            await page.reload();
            await page.waitForURL(url=>url.pathname.replace(/\/+$/,'')===new URL(base+path).pathname.replace(/\/+$/,'') && !url.searchParams.has('__pages_route'));
            await page.locator('main').waitFor();
          }
          assert.deepEqual(errors,[],'Runtime errors');
          assert.deepEqual(broken,[],'Missing scripts/styles');
          results.push({scenario:label,passed:true});
          console.log(`PASS ${label}`);
        } catch(e) {
          failed=true;results.push({scenario:label,passed:false,reason:e.message});console.error(`FAIL ${label}: ${e.message}`);
          await page.screenshot({path:`test-results/${label}-failure.png`,fullPage:true}).catch(()=>{});
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
} finally {
  await writeFile('test-results/acceptance.json',JSON.stringify({emulated:true,realIPhoneVerified:false,results},null,2));
  await new Promise(r=>server.close(r));
}
if(failed)process.exitCode=1;
