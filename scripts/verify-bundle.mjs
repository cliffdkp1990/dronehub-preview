import { lstat, readdir, readFile } from 'node:fs/promises';
import { resolve, relative, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

// Accept ONLY deployable output, never an arbitrary repository checkout.
const extensions = new Set(['.html', '.js', '.css', '.json', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.avif', '.woff', '.woff2', '.ttf', '.txt', '.webmanifest']);
const textExtensions = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt', '.webmanifest']);
const secrets = /-----BEGIN [A-Z ]*PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}|\bAKIA[A-Z0-9]{16}\b|\b(?:SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY|STRIPE_SECRET_KEY)\s*[=:]/;
const maxBytes = 40 * 1024 * 1024;

export async function verifyBundle(directory) {
  const root = resolve(directory);
  if (!(await lstat(root)).isDirectory() || (await lstat(root)).isSymbolicLink()) throw new Error('Bundle root must be a real directory');
  const files = [];
  let total = 0;
  async function visit(folder) {
    for (const name of (await readdir(folder)).sort()) {
      const path = resolve(folder, name);
      const rel = relative(root, path).replaceAll('\\', '/');
      if (!/^[A-Za-z0-9_./@-]+$/.test(rel) || rel.split('/').some(p => p.startsWith('.') || p === 'node_modules' || p === 'src')) {
        if (rel !== '.nojekyll') throw new Error(`Forbidden output path: ${rel}`);
      }
      const stat = await lstat(path);
      if (stat.isSymbolicLink()) throw new Error(`Symlink rejected: ${rel}`);
      if (stat.isDirectory()) { await visit(path); continue; }
      if (!stat.isFile() || (!extensions.has(extname(rel)) && rel !== '.nojekyll')) throw new Error(`Not a static web asset: ${rel}`);
      if (/^(?:package(?:-lock)?\.json|tsconfig.*|deployment-manifest\.json|CNAME|README\.md)$/i.test(rel)) throw new Error(`Repository/configuration file rejected: ${rel}`);
      total += stat.size;
      if (total > maxBytes || files.length >= 1500) throw new Error('Bundle exceeds size/file limit');
      const bytes = await readFile(path);
      if (textExtensions.has(extname(rel))) {
        const text = bytes.toString('utf8');
        if (secrets.test(text) || /sourceMappingURL\s*=|"sourcesContent"\s*:/.test(text)) throw new Error(`Secret or source map rejected: ${rel}`);
      }
      files.push({ path: rel, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
  }
  await visit(root);
  if (!files.some(f => f.path === 'index.html')) throw new Error('Bundle must contain index.html');
  const html = await readFile(resolve(root, 'index.html'), 'utf8');
  if (!/<html[\s>]/i.test(html) || !/<meta[^>]*name=["']viewport["']/i.test(html)) throw new Error('HTML/viewport missing');
  if (/(?:src|href)=["']\/(?!\/|dronehub-preview\/)/i.test(html)) throw new Error('Root-relative asset breaks the existing Pages subpath');
  return { files, bytes: total };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await verifyBundle(process.argv[2] || '.candidate');
  console.log(`Static bundle accepted: ${result.files.length} files, ${result.bytes} bytes. Manual review of public runtime configuration still required.`);
}
