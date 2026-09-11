# Knight Fitness Morayfield — website

The public site for Knight Fitness Morayfield, live at
<https://knightfitness-morayfield.com.au>.

It is a static site: no framework, no build step. `index.html` holds all eight
pages and renders them client-side through `support.js`. Vercel serves the
repository root as-is.

| Path | What it is |
|---|---|
| `index.html` | The whole site. Exported from the design project (see [DEPLOY.md](DEPLOY.md#editing)) |
| `thank-you.html` | Confirmation page for the 3-day pass form. Served at `/thank-you` |
| `message-received.html` | Confirmation page for the contact form. Served at `/message-received` |
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
- each confirmation page is `noindex`, absent from the sitemap, free of leftover bundler payload, keeps its header fix, and links only to routes that exist
- no page has CSS leaking out of a `style` attribute, which is how a bad edit silently drops styling

`npm run test:browser` renders the site in headless Chromium against the
local server and checks, for every route: title, description and canonical
tag; a non-empty, unique `h1`; no unresolved template holes; no first-party
request failures or console errors. It also covers client-side navigation and
back/forward, the LeadConnector form embeds, the unknown-path fallback, an
old-site redirect, the mobile menu, horizontal overflow at 390px, and the
file-mode hash router. It also covers both confirmation pages: that each
renders standalone rather than being swallowed by the app router, loads its
images, stays out of search, and does not collide or scroll sideways at four
phone widths. Third-party hosts are never contacted during the run.

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

## The confirmation pages

Where the two forms send people after they submit. Each redirect is set on the
form itself, in LeadConnector.

| Form | Send it to |
|---|---|
| 3-day pass | `https://knightfitness-morayfield.com.au/thank-you` |
| Contact | `https://knightfitness-morayfield.com.au/message-received` |

They are plain pages rather than routes of the single-page app, so they render
immediately and do not depend on the router. `vercel.json` maps each path to
its file with a rewrite that sits **before** the catch-all, which would
otherwise hand the URL to the app and show the home page instead. The list in
`tests/helpers.mjs` drives both the rewrite test and the browser tests, so
adding a third page means adding one entry there.

Both arrived as self-extracting exports that inlined their own copy of React,
the runtime, the fonts and every photo, at 969KB and 620KB. All of it was
already in this repo and byte-identical, verified by hash, so each import
swapped them for the shared files. The pages are now 16KB and 14KB and share
the browser cache of the main site. A test fails if any of that payload
reappears.

Both also arrived with the same header bug: the logo anchor had no
`flex-shrink`, so the header row squeezed it and the wordmark slid underneath
the phone number on phones. Both are fixed and both are tested at four widths.

They are deliberately `noindex, nofollow` and deliberately absent from
`sitemap.xml`. A confirmation page in the search results is both useless to
searchers and a corruption of your conversion numbers.

## Deploying

See [DEPLOY.md](DEPLOY.md).
