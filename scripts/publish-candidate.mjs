// Run only in the PRIVATE repository, after its build and acceptance checks pass.
// Never checks out or copies private source. Only verifyBundle-approved bytes leave this job.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { verifyBundle } from './verify-bundle.mjs';

export const target = 'cliffdkp1990/dronehub-preview';
export function managedPath(path) {
  return typeof path === 'string' && /^(?:index\.html|404\.html|\.nojekyll|(?:assets|images|fonts|icons|catalog|guide|vaegt|scanner|blueprints|printlab)\/[A-Za-z0-9_./@-]+|[A-Za-z0-9_-]+\.(?:ico|png|svg|webmanifest|txt|json|js|css))$/.test(path)
    && !path.split('/').some(p => p === '..' || (p.startsWith('.') && p !== '.nojekyll'))
    && !/^(?:CNAME|package(?:-lock)?\.json|deployment-manifest\.json|pnpm-lock\.yaml|chrome-test\.html|README\.md)$/i.test(path);
}
export async function publishCandidate(directory) {
  if (process.env.GITHUB_REPOSITORY !== 'cliffdkp1990/drone-finder-pro' || process.env.GITHUB_REF !== 'refs/heads/main') throw new Error('Publisher only accepts the private main branch');
  const sourceSha = process.env.GITHUB_SHA;
  const runId = process.env.GITHUB_RUN_ID;
  if (!/^[a-f0-9]{40}$/.test(sourceSha || '') || !/^\d+$/.test(runId || '')) throw new Error('Invalid build provenance');
  const token = process.env.PAGES_PUBLISH_TOKEN;
  if (!token) throw new Error('Missing public-repository-only publisher credential');
  const root = resolve(directory);
  const bundle = await verifyBundle(root);
  if (bundle.files.some(f => !managedPath(f.path))) throw new Error('Bundle contains paths outside the deployment allowlist');
  async function api(path, body, method = body ? 'POST' : 'GET') {
    const response = await fetch(`https://api.github.com/repos/${target}${path ? `/${path}` : ''}`, {
      method, headers:{ Authorization:`Bearer ${token}`, Accept:'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28', 'Content-Type':'application/json' },
      body:body ? JSON.stringify(body) : undefined,
    });
    // Never echo server response bodies, credentials or file contents into logs.
    if (!response.ok) throw new Error(`GitHub ${method} ${path.split('?')[0]} failed (${response.status})`);
    return response.json();
  }
  const repository = await api('');
  if (repository.full_name !== target || repository.private || repository.default_branch !== 'main') throw new Error('Unexpected destination repository');
  const main = await api('git/ref/heads/main');
  const base = await api(`git/commits/${main.object.sha}`);
  const previousTree = await api(`git/trees/${base.tree.sha}?recursive=1`);
  if (previousTree.truncated) throw new Error('Cannot safely inspect destination tree');
  const previousManifest = previousTree.tree.find(f => f.path === 'deployment-manifest.json');
  let previousFiles = [];
  if (previousManifest) {
    const blob = await api(`git/blobs/${previousManifest.sha}`);
    const manifest = JSON.parse(Buffer.from(blob.content, 'base64').toString('utf8'));
    if (!Array.isArray(manifest.files) || manifest.files.some(f => !managedPath(f.path))) throw new Error('Unsafe previous deployment manifest');
    previousFiles = manifest.files.map(f => f.path);
  }
  const nextPaths = new Set([...bundle.files.map(f => f.path), '.nojekyll']);
  const entries = previousFiles.filter(p => !nextPaths.has(p)).map(path => ({ path, mode:'100644', type:'blob', sha:null }));
  for (const file of bundle.files) {
    const bytes = await readFile(resolve(root, file.path));
    if (createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw new Error('Bundle changed after verification');
    const blob = await api('git/blobs', { content:bytes.toString('base64'), encoding:'base64' });
    entries.push({ path:file.path, mode:'100644', type:'blob', sha:blob.sha });
  }
  if (!nextPaths.has('index.html')) throw new Error('Missing index');
  if (!bundle.files.some(f => f.path === '.nojekyll')) entries.push({ path:'.nojekyll', mode:'100644', type:'blob', content:'' });
  const manifest = { schema:1, app:"lovable", sourceCommit:sourceSha, buildRun:runId, files:bundle.files };
  entries.push({ path:'deployment-manifest.json', mode:'100644', type:'blob', content:JSON.stringify(manifest, null, 2) + '\n' });
  const tree = await api('git/trees', { base_tree:base.tree.sha, tree:entries });
  const commit = await api('git/commits', { message:`Stage tested Lovable build ${sourceSha.slice(0, 12)}`, tree:tree.sha, parents:[main.object.sha] });
  const branch = `automation/lovable-${sourceSha.slice(0, 12)}-${runId}`;
  // This is deliberately create-only. There is no API call that updates main or merges a PR.
  await api('git/refs', { ref:`refs/heads/${branch}`, sha:commit.sha });
  const pr = await api('pulls', {
    title:`Review tested Lovable build ${sourceSha.slice(0, 12)}`, base:'main', head:branch, draft:true,
    body:`Built in the private source repository; only checked static output is included.\n\nSource commit: ${sourceSha}\nBuild run: ${runId}\n\nBefore marking ready: require green Pages acceptance, compare screenshots with approved QA9, record real iPhone Safari/Chrome checks, review public runtime configuration, and confirm rollback. Do not merge on a skipped or failed check. Existing URL: https://cliffdkp1990.github.io/dronehub-preview/\n`,
  });
  console.log(`Draft candidate PR created: ${pr.html_url}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await publishCandidate(process.argv[2] || '.candidate');
}
