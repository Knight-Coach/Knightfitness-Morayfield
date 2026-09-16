import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const SITE = 'https://knightfitness-morayfield.com.au';

export const read = (rel) => readFile(resolve(ROOT, rel), 'utf8');

/**
 * Confirmation pages. Each is a real file served at its own path rather than a
 * route of the single-page app, so a form can redirect to it and it renders
 * without waiting for the router.
 */
export const CONFIRMATION_PAGES = [
  {
    file: 'thank-you.html',
    path: '/thank-you',
    form: '3-day pass',
    title: "You're booked in — Knight Fitness Morayfield",
    h1: 'Your 3 free sessions are reserved'
  },
  {
    file: 'message-received.html',
    path: '/message-received',
    form: 'contact',
    title: 'Message received — Knight Fitness Morayfield',
    h1: 'Got your message'
  }
];

/**
 * Campaign landing pages. Also real files outside the router, but unlike the
 * confirmation pages these are public: they are indexed, they are in the
 * sitemap, and they carry their own canonical and social tags.
 */
export const LANDING_PAGES = [
  {
    file: '42-hard.html',
    path: '/42-hard',
    title: '42 Hard Challenge — Knight Fitness Morayfield',
    h1: '42 HARD',
    formId: 'F6YrDPqkBDSVHapalvQF'
  }
];

/** Every page served as its own file rather than rendered by the router. */
export const STANDALONE_PAGES = [...CONFIRMATION_PAGES, ...LANDING_PAGES];

/** The HTML files served directly, as opposed to rendered by the router. */
export const ENTRY_POINTS = ['index.html', ...STANDALONE_PAGES.map((p) => p.file)];

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

/**
 * Every URL that belongs in sitemap.xml: the router's routes plus the landing
 * pages. Confirmation pages are deliberately absent — see the tests.
 */
export async function indexableUrls() {
  const routes = await routesFromIndex();
  return [
    ...routes.map((r) => (r.slug ? `${SITE}/${r.slug}` : `${SITE}/`)),
    ...LANDING_PAGES.map((p) => `${SITE}${p.path}`)
  ];
}

/** Paths a link on any page is allowed to point at. */
export async function knownPaths() {
  const routes = await routesFromIndex();
  return new Set([
    ...routes.map((r) => (r.slug ? `/${r.slug}` : '/')),
    ...STANDALONE_PAGES.map((p) => p.path)
  ]);
}
