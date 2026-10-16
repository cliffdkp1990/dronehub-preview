import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(process.env.SITE_DIR || '.');
const raw = await readFile(resolve(root,'deployment-manifest.json'),'utf8').catch(e => { if(e.code==='ENOENT')return null;throw e; });
const suite = process.env.SITE_FLAVOR || (raw && JSON.parse(raw).app === 'lovable' ? 'lovable' : 'qa9');
if (!['qa9','lovable'].includes(suite)) throw new Error('Unknown app acceptance suite');
process.env.SITE_DIR = root;
await import(suite === 'lovable' ? './lovable-browser.mjs' : './qa9-browser.mjs');
