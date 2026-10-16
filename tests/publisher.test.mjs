import { test } from 'node:test';
import assert from 'node:assert/strict';
import { managedPath, publishCandidate } from '../scripts/publish-candidate.mjs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('publisher accepts only compiled web paths', () => {
  for (const path of ['index.html', '404.html', '.nojekyll', 'assets/index-a123.js', 'fonts/inter.woff2', 'favicon.ico']) assert.ok(managedPath(path), path);
  for (const path of ['.github/workflows/pages.yml', '../index.html', 'assets/../../README.md', 'CNAME', 'package.json', 'deployment-manifest.json', 'chrome-test.html', 'README.md', '.env', 'src/App.tsx', 'scripts/publish.mjs']) assert.ok(!managedPath(path), path);
});
test('publication writes compiled bytes to a new draft branch and never updates main', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'dronehub-publish-'));
  t.after(() => rm(dir, { recursive:true, force:true }));
  await writeFile(join(dir, 'index.html'), '<html><meta name="viewport" content="width=device-width"><body>built</body></html>');
  const env = { GITHUB_REPOSITORY:'cliffdkp1990/drone-finder-pro', GITHUB_REF:'refs/heads/main', GITHUB_SHA:'a'.repeat(40), GITHUB_RUN_ID:'123', PAGES_PUBLISH_TOKEN:'test-only-placeholder' };
  const original = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]]));
  const oldFetch = globalThis.fetch;
  const calls = [];
  Object.assign(process.env, env);
  globalThis.fetch = async (url, options) => {
    const path = url.replace('https://api.github.com/repos/cliffdkp1990/dronehub-preview', '');
    const body = options.body && JSON.parse(options.body);
    calls.push({ path, method:options.method, body });
    const data = path === '' ? { full_name:'cliffdkp1990/dronehub-preview', private:false, default_branch:'main' }
      : path === '/git/ref/heads/main' ? { object:{ sha:'main-sha' } }
      : path === '/git/commits/main-sha' ? { tree:{ sha:'base-tree' } }
      : path === '/git/trees/base-tree?recursive=1' ? { truncated:false, tree:[{ path:'.github/workflows/pages-acceptance.yml', sha:'keep' }] }
      : path === '/pulls' ? { html_url:'https://github.com/cliffdkp1990/dronehub-preview/pull/123' }
      : { sha:'created-sha' };
    return { ok:true, json:async () => data };
  };
  try {
    await publishCandidate(dir);
    assert.ok(calls.every(c => ['GET', 'POST'].includes(c.method)));
    const refs = calls.filter(c => c.path === '/git/refs');
    assert.equal(refs.length, 1);
    assert.match(refs[0].body.ref, /^refs\/heads\/automation\/lovable-/);
    const tree = calls.find(c => c.path === '/git/trees').body;
    assert.equal(tree.base_tree, 'base-tree');
    assert.deepEqual(tree.tree.map(f => f.path).sort(), ['.nojekyll', 'deployment-manifest.json', 'index.html']);
    const pr = calls.find(c => c.path === '/pulls').body;
    assert.equal(pr.draft, true);
    assert.equal(pr.base, 'main');
    assert.ok(!calls.some(c => /merge|pages|visibility/.test(c.path)));
  } finally {
    globalThis.fetch = oldFetch;
    for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
test('publisher refuses to run from public repository or a feature branch', async () => {
  const original = { repository:process.env.GITHUB_REPOSITORY, ref:process.env.GITHUB_REF };
  try {
    process.env.GITHUB_REPOSITORY = 'cliffdkp1990/dronehub-preview';
    process.env.GITHUB_REF = 'refs/heads/main';
    await assert.rejects(publishCandidate('.'), /private main/);
    process.env.GITHUB_REPOSITORY = 'cliffdkp1990/drone-finder-pro';
    process.env.GITHUB_REF = 'refs/heads/untrusted';
    await assert.rejects(publishCandidate('.'), /private main/);
  } finally {
    for (const [key, value] of [['GITHUB_REPOSITORY', original.repository], ['GITHUB_REF', original.ref]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
