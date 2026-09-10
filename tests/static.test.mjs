// Checks that need no browser: file integrity, SEO plumbing, vendored dependencies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { ROOT, SITE, read, routesFromIndex } from './helpers.mjs';

const exists = (rel) => access(resolve(ROOT, rel)).then(() => true, () => false);

test('every asset referenced by index.html exists on disk', async () => {
  const html = await read('index.html');
  const refs = new Set(html.match(/assets\/[A-Za-z0-9_./@-]+/g));
  assert.ok(refs.size >= 28, `expected at least 28 asset references, found ${refs.size}`);
  const missing = [];
  for (const ref of refs) if (!(await exists(ref))) missing.push(ref);
  assert.deepEqual(missing, []);
});

test('every file under assets/ is referenced by index.html', async () => {
  const html = await read('index.html');
  const walk = async (dir) => {
    const out = [];
    for (const e of await readdir(join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) out.push(...(await walk(rel)));
      else out.push(rel);
    }
    return out;
  };
  const files = (await walk('assets')).filter((f) => !f.endsWith('/LICENSE'));
  const unused = files.filter((f) => !html.includes(f));
  assert.deepEqual(unused, []);
});

test('sitemap.xml lists exactly the routes in index.html', async () => {
  const routes = await routesFromIndex();
  const xml = await read('sitemap.xml');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).sort();
  const expected = routes.map((r) => (r.slug ? `${SITE}/${r.slug}` : `${SITE}/`)).sort();
  assert.deepEqual(locs, expected);
});

test('robots.txt allows crawling and points at the sitemap', async () => {
  const txt = await read('robots.txt');
  assert.match(txt, /^Allow: \/$/m);
  assert.match(txt, new RegExp(`^Sitemap: ${SITE.replace(/\./g, '\\.')}/sitemap\\.xml$`, 'm'));
});

test('vercel.json rewrites every path to index.html and redirects only to real routes', async () => {
  const cfg = JSON.parse(await read('vercel.json'));
  const routes = await routesFromIndex();
  const slugs = new Set(routes.map((r) => (r.slug ? `/${r.slug}` : '/')));
  assert.deepEqual(cfg.rewrites, [{ source: '/(.*)', destination: '/index.html' }]);
  assert.equal(cfg.framework, null, 'framework must be the Other preset');
  assert.equal(cfg.installCommand, '', 'installs must be skipped so the dev package.json never runs on Vercel');
  for (const r of cfg.redirects) {
    assert.ok(slugs.has(r.destination), `redirect ${r.source} points at unknown route ${r.destination}`);
    assert.ok(!slugs.has(r.source), `redirect ${r.source} would shadow a live route`);
    assert.equal(r.permanent, true, `${r.source} should be a permanent redirect`);
  }
});

test('index.html keeps the Search Console verification tag and absolute social image URLs', async () => {
  const html = await read('index.html');
  assert.match(html, /<meta name="google-site-verification" content="wPEI4AUmJK-R1IlC3kCtrHCOIJxc0Zu-cQ5fQK8vMT0" \/>/);
  assert.match(html, new RegExp(`<meta property="og:image" content="${SITE}/assets/og-image.jpg" />`));
  assert.match(html, new RegExp(`<meta name="twitter:image" content="${SITE}/assets/og-image.jpg" />`));
  assert.match(html, new RegExp(`<link rel="canonical" href="${SITE}/" />`));
  assert.match(html, /"@type": "HealthClub"/);
});

test('index.html keeps the FILE_MODE fallback that makes local double-click preview work', async () => {
  const html = await read('index.html');
  assert.match(html, /const FILE_MODE = window\.location\.protocol === 'file:'/);
});

test('vendored React matches the SRI hashes support.js expects from unpkg', async () => {
  const runtime = await read('support.js');
  const html = await read('index.html');
  const sri = (name) => runtime.match(new RegExp(`${name} = "(sha384-[^"]+)"`))[1];
  const url = (name) => runtime.match(new RegExp(`${name} = "https://unpkg.com/([^"]+)"`))[1];
  const pairs = [
    ['REACT_URL', 'REACT_SRI', 'react'],
    ['REACT_DOM_URL', 'REACT_DOM_SRI', 'react-dom']
  ];
  for (const [urlKey, sriKey, pkg] of pairs) {
    const version = url(urlKey).match(new RegExp(`^${pkg}@([0-9.]+)/`))[1];
    const rel = `assets/vendor/${pkg}-${version}.production.min.js`;
    assert.match(html, new RegExp(`<script src="\\./${rel.replace(/\./g, '\\.')}"></script>`), `${rel} must be loaded before support.js`);
    const buf = await readFile(resolve(ROOT, rel));
    const hash = 'sha384-' + createHash('sha384').update(buf).digest('base64');
    assert.equal(hash, sri(sriKey), `${rel} is not the same build support.js pins`);
  }
  const head = html.slice(0, html.indexOf('</head>'));
  const order = ['src="./assets/vendor/react-1', 'src="./assets/vendor/react-dom-', 'src="./support.js"'].map((s) => head.indexOf(s));
  assert.ok(order[0] < order[1] && order[1] < order[2], 'React, then ReactDOM, then support.js');
});

test('index.html does not import JSX modules that would pull Babel from unpkg at runtime', async () => {
  const html = await read('index.html');
  assert.doesNotMatch(html, /<x-import/);
});
