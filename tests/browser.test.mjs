// Renders the site in headless Chromium against the local Vercel-equivalent server.
// Set KEEP_SCREENSHOTS=1 to write one screenshot per route into test-results/.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { listen } from '../scripts/serve.js';
import { ROOT, routesFromIndex } from './helpers.mjs';

// Third-party hosts the page talks to: Google Fonts, the LeadConnector form embed
// and media library, Google Maps. Their availability is not something this
// repository controls, so the suite never contacts them: every request to one of
// these hosts is aborted at the browser and the resulting console noise ignored.
// That keeps the run hermetic and fast, and it still exercises the page's own
// handling of a missing font, video or embed script.
const EXTERNAL = /fonts\.g(oogleapis|static)\.com|msgsndr\.com|leadconnectorhq\.com|filesafe\.space|google\.com\/maps/;

let server, base, browser, routes;
const shots = process.env.KEEP_SCREENSHOTS ? join(ROOT, 'test-results') : null;

before(async () => {
  ({ server, port: base } = await listen(0));
  base = `http://127.0.0.1:${base}`;
  browser = await chromium.launch();
  routes = await routesFromIndex();
  if (shots) await mkdir(shots, { recursive: true });
});
after(async () => {
  await browser?.close();
  server?.close();
});

async function open(url, { width = 1280, height = 900 } = {}) {
  const page = await browser.newPage({ viewport: { width, height } });
  await blockExternal(page);
  const errors = [];
  const failed = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // Chromium reports a blocked resource as a bare "Failed to load resource";
    // the URL lives in the message location. Attach it so EXTERNAL can filter it.
    const at = (m.location() && m.location().url) || '';
    errors.push(at ? `${m.text()} (${at})` : m.text());
  });
  page.on('requestfailed', (r) => failed.push(r.url()));
  page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  // support.js boots React after DOMContentLoaded; wait for the app shell.
  await page.waitForSelector('#dc-root header nav', { timeout: 15000 });
  await page.waitForSelector('#dc-root h1', { timeout: 15000 });
  return { page, errors, failed };
}

async function blockExternal(page) {
  await page.route((u) => EXTERNAL.test(u.href), (route) => route.abort('blockedbyclient'));
}

function firstParty(list) {
  return list.filter((u) => !EXTERNAL.test(u));
}

test('each route renders its own page with the right title, description and canonical', async (t) => {
  for (const r of routes) {
    const path = r.slug ? `/${r.slug}` : '/';
    await t.test(path, async () => {
      const { page, errors, failed } = await open(base + path);
      assert.equal(await page.title(), r.title);
      assert.equal(await page.getAttribute('meta[name="description"]', 'content'), r.desc);
      assert.equal(await page.getAttribute('link[rel="canonical"]', 'href'), `https://knightfitness-morayfield.com.au${path === '/' ? '/' : path}`);
      const h1 = (await page.locator('#dc-root h1').first().innerText()).trim();
      assert.ok(h1.length > 3, `h1 is empty on ${path}`);
      const holes = await page.evaluate(() => {
        const root = document.querySelector('#dc-root');
        const unresolved = root.querySelectorAll('.sc-missing, .sc-unresolved, .sc-placeholder-error, .sc-logic-error').length;
        return { unresolved, braces: (root.innerText.match(/\{\{/g) || []).length };
      });
      assert.deepEqual(holes, { unresolved: 0, braces: 0 }, `unresolved template holes on ${path}`);
      assert.deepEqual(firstParty(failed), [], `first-party requests failed on ${path}`);
      assert.deepEqual(errors.filter((e) => !EXTERNAL.test(e)), [], `console errors on ${path}`);
      if (shots) await page.screenshot({ path: join(shots, `${r.page}-desktop.png`), fullPage: true });
      await page.close();
    });
  }
});

test('each h1 is unique across routes', async () => {
  const seen = new Map();
  for (const r of routes) {
    const { page } = await open(base + (r.slug ? `/${r.slug}` : '/'));
    const h1 = (await page.locator('#dc-root h1').first().innerText()).trim();
    assert.ok(!seen.has(h1), `"${h1}" is the h1 on both ${seen.get(h1)} and ${r.page}`);
    seen.set(h1, r.page);
    await page.close();
  }
});

test('client-side navigation updates the URL, title and content without a reload', async () => {
  const { page } = await open(base + '/');
  const homeH1 = await page.locator('#dc-root h1').first().innerText();
  await page.evaluate(() => { window.__marker = 'still-here'; });
  await page.locator('#dc-root header nav a[href="/about"]').first().click();
  await page.waitForURL(base + '/about');
  await page.waitForFunction((t) => document.title === t, routes.find((r) => r.page === 'about').title);
  assert.equal(await page.evaluate(() => window.__marker), 'still-here', 'page reloaded instead of routing client-side');
  assert.notEqual(await page.locator('#dc-root h1').first().innerText(), homeH1);
  await page.goBack();
  await page.waitForURL(base + '/');
  assert.equal(await page.title(), routes[0].title);
  await page.close();
});

test('the 3-day pass and contact pages embed the LeadConnector forms', async () => {
  for (const [path, formId] of [['/get-started', 'PvrT5GhwQ2LAS8Q4wsnf'], ['/contact', 'v89V3Ku9h7ZgkCdOXHD4']]) {
    const { page } = await open(base + path);
    const src = await page.locator(`iframe[src*="widget/form/${formId}"]`).first().getAttribute('src');
    assert.ok(src, `form ${formId} not embedded on ${path}`);
    await page.close();
  }
});

test('an unknown path falls back to the home page instead of a blank screen', async () => {
  const { page } = await open(base + '/this-page-does-not-exist');
  assert.equal(await page.title(), routes[0].title);
  await page.close();
});

test('old-site URLs redirect to the new routes', async () => {
  const { page } = await open(base + '/team-training');
  assert.equal(new URL(page.url()).pathname, '/about');
  await page.close();
});

test('mobile viewport: nav collapses to a menu button and the page does not scroll sideways', async () => {
  const { page, errors } = await open(base + '/', { width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 0, `page scrolls sideways by ${overflow}px at 390px wide`);
  const menuButton = page.locator('#dc-root header a[aria-label="Menu"]').first();
  assert.ok(await menuButton.isVisible(), 'no menu button on mobile');
  await menuButton.click();
  await page.waitForSelector('#dc-root a[href="/schedule"]:visible');
  await page.locator('#dc-root a[href="/schedule"]:visible').first().click();
  await page.waitForURL(base + '/schedule');
  assert.deepEqual(errors.filter((e) => !EXTERNAL.test(e)), []);
  if (shots) await page.screenshot({ path: join(shots, 'home-mobile.png'), fullPage: true });
  await page.close();
});

test('opened as a bare file it falls back to hash routing (design preview and double-click)', async () => {
  const page = await browser.newPage();
  await blockExternal(page);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(pathToFileURL(resolve(ROOT, 'index.html')).href + '#/reviews');
  await page.waitForSelector('#dc-root h1', { timeout: 15000 });
  await page.waitForFunction((t) => document.title === t, routes.find((r) => r.page === 'reviews').title);
  const href = await page.locator('#dc-root header nav a').first().getAttribute('href');
  assert.match(href, /^#\//, 'nav links must be hash links in file mode');
  assert.deepEqual(errors.filter((e) => !EXTERNAL.test(e)), []);
  await page.close();
});
