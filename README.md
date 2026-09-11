# Knight Fitness Morayfield — website

The public site for Knight Fitness Morayfield, live at
<https://knightfitness-morayfield.com.au>.

It is a static site: no framework, no build step. `index.html` holds all eight
pages and renders them client-side through `support.js`. Vercel serves the
repository root as-is.

| Path | What it is |
|---|---|
| `index.html` | The whole site. Exported from the design project (see [DEPLOY.md](DEPLOY.md#editing)) |
| `thank-you.html` | The confirmation page the 3-day pass form redirects to. Served at `/thank-you` |
| `support.js` | The runtime `index.html` depends on. Generated; do not edit or rename |
| `assets/` | Images, favicons, the social-share card, and the vendored React build |
| `vercel.json` | Rewrites, 301s from the old site, cache headers, and the "no install, no build" settings |
| `robots.txt`, `sitemap.xml` | Crawl permission and the eight URLs |
| `scripts/serve.js` | Local preview server that mirrors `vercel.json` |
| `tests/` | The test suite (see below) |
| `DEPLOY.md` | Deployment, routing and editing notes |

## Preview locally

```bash
node scripts/serve.js          # http://localhost:4173
node scripts/serve.js 8080     # any other port
```

The server applies the same redirects, rewrite and cache headers Vercel does,
so `/about` and `/team-training` behave exactly as they will in production.
Opening `index.html` straight from the file system also works: the site
notices it has no server and switches to hash routing (`#/about`).

## Tests

```bash
npm install                                  # once; installs Playwright
npx playwright install --with-deps chromium  # once; the browser used by the tests
npm test
```

`npm run test:static` runs the checks that need no browser:

- every image `index.html` references exists, and nothing in `assets/` is unused
- `sitemap.xml` lists exactly the routes defined in `index.html`
- `vercel.json` still rewrites everything to `index.html`, every 301 lands on a
  real route, and Vercel is still told to skip installs
- the Search Console verification tag, canonical URL, absolute social image
  URLs and the schema.org markup are present
- the vendored React files are byte-for-byte the builds `support.js` pins
- `thank-you.html` is `noindex`, absent from the sitemap, free of leftover bundler payload, and links only to routes that exist

`npm run test:browser` renders the site in headless Chromium against the
local server and checks, for every route: title, description and canonical
tag; a non-empty, unique `h1`; no unresolved template holes; no first-party
request failures or console errors. It also covers client-side navigation and
back/forward, the LeadConnector form embeds, the unknown-path fallback, an
old-site redirect, the mobile menu, horizontal overflow at 390px, and the
file-mode hash router. It also covers `/thank-you`: that it renders standalone
rather than being swallowed by the app router, loads its photos, stays out of
search, and that its header does not collide at phone widths. Third-party hosts
are never contacted during the run.

Set `KEEP_SCREENSHOTS=1` to save a screenshot per route into `test-results/`.

CI runs both suites on every push and pull request
(`.github/workflows/ci.yml`).

## Vendored React

`support.js` normally fetches React and ReactDOM from unpkg.com on every page
load, and refuses to boot if that fails. `index.html` loads the same two
files from `assets/vendor/` first, which makes the runtime skip the CDN. The
files are the unmodified `umd/*.production.min.js` builds from the npm
packages; the static test suite hashes them against the subresource-integrity
values baked into `support.js`, so a mismatch fails the build.

If a future `support.js` pins a different React version, drop the matching
UMD builds into `assets/vendor/` with the version in the file name and update
the two `<script>` tags at the top of `index.html`. The version is in the
file name so the one-year immutable cache on `/assets/` never serves a stale
build.

## The thank-you page

`thank-you.html` is where the 3-day pass form sends people after they submit.
Set that redirect on the form in LeadConnector, to
`https://knightfitness-morayfield.com.au/thank-you`.

It is a plain page rather than a route of the single-page app, so it renders
immediately and does not depend on the router. `vercel.json` maps `/thank-you`
to the file with a rewrite that sits **before** the catch-all, which would
otherwise hand the URL to the app and show the home page instead.

It arrived as a self-extracting export that inlined its own copy of React, the
runtime, the fonts and four member photos, at 969KB. All of that was already in
this repo and byte-identical, so the import swapped each one for the shared
file. The page is now around 16KB and shares the browser cache of the main
site. A test fails if any of that payload reappears.

It is deliberately `noindex, nofollow` and deliberately absent from
`sitemap.xml`. A confirmation page in the search results is both useless to
searchers and a corruption of your conversion numbers.

## Deploying

See [DEPLOY.md](DEPLOY.md).
