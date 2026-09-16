// Checks that need no browser: file integrity, SEO plumbing, vendored dependencies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import {
  ROOT, SITE, read, routesFromIndex, indexableUrls, knownPaths,
  ENTRY_POINTS, CONFIRMATION_PAGES, LANDING_PAGES, STANDALONE_PAGES
} from './helpers.mjs';

const exists = (rel) => access(resolve(ROOT, rel)).then(() => true, () => false);

test('every asset referenced by an HTML entry point exists on disk', async () => {
  for (const entry of ENTRY_POINTS) {
    const html = await read(entry);
    const refs = new Set(html.match(/assets\/[A-Za-z0-9_./@-]+/g));
    assert.ok(refs.size > 0, `${entry} references no assets`);
    const missing = [];
    for (const ref of refs) if (!(await exists(ref))) missing.push(ref);
    assert.deepEqual(missing, [], `missing assets referenced by ${entry}`);
  }
});

test('every file under assets/ is referenced by an HTML entry point', async () => {
  const html = (await Promise.all(ENTRY_POINTS.map(read))).join('\n');
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

test('sitemap.xml lists exactly the routes in index.html plus the landing pages', async () => {
  const xml = await read('sitemap.xml');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).sort();
  assert.deepEqual(locs, (await indexableUrls()).sort());
});

test('robots.txt allows crawling and points at the sitemap', async () => {
  const txt = await read('robots.txt');
  assert.match(txt, /^Allow: \/$/m);
  assert.match(txt, new RegExp(`^Sitemap: ${SITE.replace(/\./g, '\\.')}/sitemap\\.xml$`, 'm'));
});

test('vercel.json routes the standalone pages before the catch-all, and redirects only to real routes', async () => {
  const cfg = JSON.parse(await read('vercel.json'));
  const slugs = await knownPaths();
  // Order matters: Vercel takes the first matching rewrite, so the catch-all
  // that feeds the single-page app has to come last or it swallows the
  // confirmation pages and every form submission lands on the home page.
  assert.deepEqual(cfg.rewrites, [
    ...STANDALONE_PAGES.map((p) => ({ source: p.path, destination: `/${p.file}` })),
    { source: '/(.*)', destination: '/index.html' }
  ]);
  for (const page of STANDALONE_PAGES) {
    assert.ok(
      cfg.headers.some((h) => h.source === `/${page.file}`),
      `${page.file} needs a revalidate cache header like index.html`
    );
  }
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

// ---------------------------------------------------------------------------
// The standalone pages. Each is served as its own file rather than as a route
// of the single-page app, so each needs its own checks. They all arrive as
// self-extracting exports that inline React, the runtime, the fonts and every
// image, and every one of them has to be stripped back to the shared files.
// ---------------------------------------------------------------------------

for (const page of STANDALONE_PAGES) {
  test(`${page.file} reuses the shared runtime instead of bundling its own`, async () => {
    const html = await read(page.file);
    const head = html.slice(0, html.indexOf('</head>'));
    const order = [
      'src="./assets/vendor/react-18.3.1.production.min.js"',
      'src="./assets/vendor/react-dom-18.3.1.production.min.js"',
      'src="./support.js"'
    ].map((s) => head.indexOf(s));
    assert.ok(order.every((i) => i !== -1), 'React, ReactDOM and support.js must all be loaded');
    assert.ok(order[0] < order[1] && order[1] < order[2], 'React, then ReactDOM, then support.js');
  });

  test(`${page.file} carries no leftover bundler payload`, async () => {
    const html = await read(page.file);
    // All of it is already in this repo, so none of it should survive the import.
    assert.doesNotMatch(html, /base64,/, 'an inlined data URI survived');
    assert.doesNotMatch(html, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/, 'a bundler resource id survived');
    assert.doesNotMatch(html, /__bundler/, 'bundler scaffolding survived');
    assert.doesNotMatch(html, /\/\/unpkg\.com\//, 'a CDN script URL survived');
    assert.ok(html.length < 40000, `page should stay small, is ${html.length} bytes`);
  });

  test(`${page.file} loads the shared webfonts from Google rather than inlining them`, async () => {
    const html = await read(page.file);
    // The export ships eleven woff2 subsets inline, about 300KB. The rest of the
    // site links the same two families from Google Fonts, so the pages share a
    // cache entry instead of each carrying their own copy.
    assert.doesNotMatch(html, /@font-face/, 'inlined webfonts survived the import');
    assert.match(html, /fonts\.googleapis\.com\/css2\?family=Inter[^"]*Plus\+Jakarta\+Sans/);
  });

  test(`${page.file} never leaves a template hole in a src the parser fetches`, async () => {
    const html = await read(page.file);
    // The parser fetches a src as it reads the tag, before the runtime can
    // substitute anything, so `src="{{ x }}"` is a wasted request on every page
    // load. Deferring the fetch with loading="lazy" is what buys the runtime the
    // time to fill the hole in; anything eager needs a real URL in the markup,
    // or the data-src hydration index.html uses for <video>.
    const eager = [...html.matchAll(/<[a-z]+[^>]*\ssrc="[^"]*\{\{[^>]*>/gi)]
      .map((m) => m[0])
      .filter((tag) => !/loading="lazy"/.test(tag))
      .map((tag) => tag.slice(0, 90));
    assert.deepEqual(eager, [], 'an eagerly fetched src still holds an unresolved template hole');
  });

  test(`every internal link on ${page.file} points at a path that exists`, async () => {
    const html = await read(page.file);
    const known = await knownPaths();
    const prefix = SITE.replace(/[.]/g, '\\.');
    const internal = [...html.matchAll(new RegExp(`href="${prefix}([^"]*)"`, 'g'))]
      .map((m) => m[1] || '/')
      .filter((p) => !p.startsWith('#'));
    assert.ok(internal.length >= 1, `expected internal links, found ${internal.length}`);
    assert.deepEqual(internal.filter((p) => !known.has(p)), [], 'links to paths the site does not have');
  });
}

// ---------------------------------------------------------------------------
// Confirmation pages only. They exist to be landed on after a form submission,
// never to be found in a search result.
// ---------------------------------------------------------------------------

for (const page of CONFIRMATION_PAGES) {
  test(`${page.file} is excluded from search, and stays out of the sitemap`, async () => {
    const html = await read(page.file);
    assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
    const xml = await read('sitemap.xml');
    const slug = page.path.slice(1);
    assert.ok(!xml.includes(slug), `a noindex confirmation page must not be in the sitemap`);
  });

  test(`${page.file} keeps the header fix that stops the wordmark colliding`, async () => {
    const html = await read(page.file);
    // Both pages arrived with a logo anchor that had no flex-shrink, so the
    // header row squeezed it and the wordmark slid under the phone number.
    const anchor = html.match(/<a href="https:\/\/knightfitness-morayfield\.com\.au\/" style="([^"]*)"\s*>/);
    assert.ok(anchor, 'logo anchor not found');
    assert.match(anchor[1], /flex-shrink:\s*0/, 'logo anchor must not shrink');
    assert.match(html, /@media \(max-width: 560px\) \{ \.ty-wordmark \{ display: none; \} \}/);
  });

  test(`every internal link on ${page.file} reaches the rest of the site`, async () => {
    const html = await read(page.file);
    const prefix = SITE.replace(/[.]/g, '\\.');
    const internal = [...html.matchAll(new RegExp(`href="${prefix}([^"]*)"`, 'g'))];
    assert.ok(internal.length >= 3, `a confirmation page is a dead end with ${internal.length} links out`);
  });
}

// ---------------------------------------------------------------------------
// The campaign landing pages. Public, indexed, and each one carries its own
// canonical, social card and structured data because the router's copy of that
// machinery never runs for them.
// ---------------------------------------------------------------------------

for (const page of LANDING_PAGES) {
  test(`${page.file} is indexable and listed in the sitemap`, async () => {
    const html = await read(page.file);
    assert.doesNotMatch(html, /noindex/, 'a campaign landing page must be indexable');
    const xml = await read('sitemap.xml');
    assert.ok(xml.includes(`${SITE}${page.path}</loc>`), `${page.path} is missing from the sitemap`);
  });

  test(`${page.file} carries its own canonical, title and social card`, async () => {
    const html = await read(page.file);
    assert.match(html, new RegExp(`<link rel="canonical" href="${SITE}${page.path}">`));
    assert.ok(html.includes(`<title>${page.title}</title>`), `title should be "${page.title}"`);
    const desc = html.match(/<meta name="description" content="([^"]+)">/);
    assert.ok(desc && desc[1].length > 60 && desc[1].length <= 165, 'description should be a usable search snippet');
    // Social scrapers do not execute JavaScript and do not resolve relative
    // image paths, so these two have to be absolute in the static HTML.
    assert.match(html, new RegExp(`<meta property="og:image" content="${SITE}/assets/og-image.jpg">`));
    assert.match(html, new RegExp(`<meta name="twitter:image" content="${SITE}/assets/og-image.jpg">`));
  });

  test(`${page.file} has valid structured data`, async () => {
    const html = await read(page.file);
    const block = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    assert.ok(block, 'no structured data');
    const data = JSON.parse(block[1]);
    assert.equal(data['@type'], 'Event');
    assert.ok(Date.parse(data.startDate) < Date.parse(data.endDate), 'the event ends before it starts');
    assert.ok(data.offers.length > 0 && data.offers.every((o) => o.priceCurrency === 'AUD'));
  });

  test(`${page.file} is reachable from the site rather than orphaned`, async () => {
    const html = await read('index.html');
    // A campaign page nothing links to is invisible to anyone who did not click
    // the ad, and to Google's crawl of the site's internal links.
    assert.ok(
      html.includes(`fileHrefFor('${page.path}')`),
      `nothing in index.html links to ${page.path}`
    );
  });

  test(`${page.file} embeds its registration form with a real URL`, async () => {
    const html = await read(page.file);
    assert.match(html, new RegExp(`src="https://api\\.leadconnectorhq\\.com/widget/form/${page.formId}"`));
    // The embed script that resizes the iframe is injected at runtime, the same
    // way index.html does it, rather than bundled into the page.
    assert.match(html, /link\.msgsndr\.com\/js\/form_embed\.js/);
    assert.doesNotMatch(html, /ghl_embed/, 'the inlined LeadConnector embed script survived');
  });

  test(`${page.file} pins its countdown to a real, timezone-explicit instant`, async () => {
    const html = await read(page.file);
    // Built from local date parts the countdown is wrong by hours for anyone
    // outside Queensland. Queensland has no daylight saving, so +10:00 is exact.
    const kickoff = html.match(/const KICKOFF = Date\.parse\('([^']+)'\);/);
    assert.ok(kickoff, 'KICKOFF not found');
    assert.match(kickoff[1], /\+10:00$/, 'the kickoff instant must carry the Queensland offset');
    assert.ok(Number.isFinite(Date.parse(kickoff[1])), 'KICKOFF is not a parseable date');
    const data = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    assert.equal(Date.parse(kickoff[1]), Date.parse(data.startDate), 'the countdown and the structured data disagree');
  });
}

test('no page has CSS declarations leaking out of a style attribute', async () => {
  // A malformed edit can turn `style="a; b"` into `style="a" b;` which parses as
  // stray attributes and silently drops the properties.
  for (const entry of ENTRY_POINTS) {
    const html = await read(entry);
    const stray = [...html.matchAll(/<[a-z]+[^>]*"\s+[a-z-]+:\s*[^>]*>/gi)].map((m) => m[0].slice(0, 90));
    assert.deepEqual(stray, [], `${entry} has CSS outside a style attribute`);
  }
});
