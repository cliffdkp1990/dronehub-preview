import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyBundle } from '../scripts/verify-bundle.mjs';

const html = '<html><head><meta name="viewport" content="width=device-width"></head><body></body></html>';
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'dronehub-bundle-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, 'index.html'), html);
  return dir;
}
test('accepts compiled assets and hashes the exact bytes', async t => {
  const dir = await fixture(t);
  await mkdir(join(dir, 'assets'));
  await writeFile(join(dir, 'assets/app-123.js'), 'console.log("ready")');
  const result = await verifyBundle(dir);
  assert.equal(result.files.length, 2);
  assert.match(result.files[0].sha256, /^[a-f0-9]{64}$/);
});
for (const name of ['.env', 'app.js.map', 'package.json', 'CNAME', 'secret.ts', 'deployment-manifest.json']) {
  test(`rejects ${name}`, async t => {
    const dir = await fixture(t);
    await writeFile(join(dir, name), '{}');
    await assert.rejects(verifyBundle(dir));
  });
}
test('rejects inline source maps and private credentials', async t => {
  const dir = await fixture(t);
  for (const content of ['//# sourceMappingURL=data:application/json;base64,e30=', 'const key="ghp_' + 'x'.repeat(36) + '"']) {
    await writeFile(join(dir, 'app.js'), content);
    await assert.rejects(verifyBundle(dir));
  }
});
test('rejects missing entry point and broken Pages asset paths', async t => {
  const dir = await fixture(t);
  await writeFile(join(dir, 'index.html'), html.replace('</head>', '<script src="/assets/app.js"></script></head>'));
  await assert.rejects(verifyBundle(dir), /subpath/);
  await rm(join(dir, 'index.html'));
  await assert.rejects(verifyBundle(dir), /index.html/);
});
