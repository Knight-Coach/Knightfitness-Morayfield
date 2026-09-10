import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const SITE = 'https://knightfitness-morayfield.com.au';

export const read = (rel) => readFile(resolve(ROOT, rel), 'utf8');

/** The route table lives in index.html. Parse it instead of duplicating it here. */
export async function routesFromIndex() {
  const html = await read('index.html');
  const block = html.match(/const ROUTES = \[([\s\S]*?)\n\];/);
  if (!block) throw new Error('ROUTES table not found in index.html');
  const routes = [];
  const re = /page:\s*'([^']*)',\s*slug:\s*'([^']*)',\s*title:\s*'((?:[^'\\]|\\.)*)',\s*desc:\s*'((?:[^'\\]|\\.)*)'/g;
  let m;
  while ((m = re.exec(block[1]))) {
    routes.push({ page: m[1], slug: m[2], title: m[3].replace(/\\'/g, "'"), desc: m[4].replace(/\\'/g, "'") });
  }
  if (routes.length === 0) throw new Error('ROUTES table parsed to zero rows');
  return routes;
}
