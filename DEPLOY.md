# Knight Fitness Morayfield — deploy notes

Static site. No build step, no npm install, no framework. Every file in this
folder is served as-is.

## Contents

| File | Purpose |
|---|---|
| `index.html` | The whole site — all 8 pages live in here |
| `thank-you.html` | Post-submission confirmation page, served at `/thank-you`. Not part of the router |
| `support.js` | The runtime `index.html` depends on. Required. Do not rename |
| `assets/` | 28 optimised images + favicons + OG card, plus the vendored React build in `assets/vendor/` |
| `vercel.json` | Rewrites, 301 redirects from the old URLs, cache headers, and `framework: null` + `installCommand: ""` so Vercel never runs the dev-only `package.json` |
| `robots.txt` | Crawl permission + sitemap pointer |
| `sitemap.xml` | All 8 URLs |
| `package.json`, `scripts/`, `tests/`, `.github/` | Local preview server, test suite and CI. Not part of the deployed site — see [README.md](README.md) |

## Deploying

The site lives in the `Knight-Coach/Knightfitness-Morayfield` GitHub repository.
Create a Vercel project from it (Add New → Project → import the repo) and keep
the defaults: `vercel.json` already pins the **Other** preset, an empty install
command and no build command, so the dashboard needs nothing set. Output is
served from the repository root.

From the CLI instead:

```bash
vercel link
vercel --prod
```

Run `npm test` before deploying; CI runs the same suite on every push.

## Do not remove

**`vercel.json`.** Without it every URL except `/` returns 404, and the 301s
from the old site's URLs disappear.

**The `google-site-verification` meta tag in `index.html`.** It is the existing
verification for this domain's Google Search Console property. Removing it
unverifies the property and loses access to the search data.

**The `FILE_MODE` branch in the routing code.** When the page is opened as a
bare `.html` file with no server there is nothing to rewrite `/about`, so it
falls back to hash routing. This is what keeps local preview working.

**The two `assets/vendor/react-*.js` script tags at the top of `index.html`.**
They must stay before `support.js`. Without them the runtime fetches React from
unpkg.com on every page load and the site is down whenever unpkg is.

**The `/thank-you` rewrite in `vercel.json`, and its position.** It has to stay
ahead of the `/(.*)` catch-all. Vercel takes the first matching rewrite, so if
the catch-all comes first every visitor who just submitted the form gets the
home page instead of the confirmation.

**`framework`, `installCommand` and the `/support.js` header in `vercel.json`.**
Removing the first two makes Vercel run `npm install` on deploy for no reason;
the header keeps `support.js` revalidated alongside `index.html`.

## Routing

Real paths, handled client-side and rewritten to `index.html` by Vercel.

| Path | Page |
|---|---|
| `/` | Home |
| `/about` | About & Team Training |
| `/schedule` | Timetable |
| `/reviews` | Reviews |
| `/6-week-challenge` | 6 Week Challenge |
| `/your-first-visit` | Your First Visit |
| `/get-started` | Claim 3-day pass |
| `/contact` | Contact |
| `/thank-you` | Confirmation page after the 3-day pass form. A real file, not a route |

301 redirects from the previous site are in `vercel.json`:
`/home` → `/`, `/price` → `/get-started`, `/team-training` → `/about`,
`/contact-us` and `/contact-us2-903709` → `/contact`,
`/get-started2-703458` → `/get-started`.

## After the first deploy

1. Test the Vercel preview URL on a real phone on mobile data.
2. Submit both forms and confirm they land in LeadConnector.
3. Point the domain at Vercel (Settings → Domains).
4. In Search Console, submit `https://knightfitness-morayfield.com.au/sitemap.xml`.
5. Use the URL Inspection tool on `/` and one inner page to confirm Google
   renders them.

## Known limitations

- **Videos are hotlinked** to `assets.cdn.filesafe.space` — the gym's
  LeadConnector media library, not the old website's host. They keep working as
  long as that account exists. Nine files: one hero, eight testimonials.
- **Forms are LeadConnector iframes.** They need `link.msgsndr.com/js/form_embed.js`,
  which `index.html` injects at runtime.
- **Client-rendered.** Google executes JS and will index it, but the HTML
  arrives close to empty. Facebook, LinkedIn and Slack do not execute JS: they
  read the `og:*` tags from the static HTML, which is why `og:image` is an
  absolute URL. Pre-rendering one static file per route is the next
  upgrade if organic search becomes a priority.
- **Content gap:** the 6 Week Challenge price is not stated anywhere. The
  challenge page routes that question to an enquiry form instead.

## Editing

`index.html` is generated from `Knight Fitness Morayfield.dc.html` in the design
project. Small copy and price edits are safe to make directly in `index.html`.
Anything structural is better done in the design file and re-exported, or the
two drift apart.

Two things in `index.html` are not in the design file and must be re-applied
after a re-export (the static test suite fails if either is missing):

1. The two `assets/vendor/react-*.js` script tags before `support.js` in `<head>`.
2. Absolute `https://knightfitness-morayfield.com.au/...` URLs in the
   `og:image` and `twitter:image` meta tags. The design export writes them
   relative, which social previews reject.

`thank-you.html` came from a separate standalone export and has the same
problem in a different form. If it is re-exported, redo these three things, all
of which the test suite enforces:

1. Replace the bundled runtime script with the site's own React, ReactDOM and
   `support.js` tags.
2. Replace the inlined fonts, logo and member photos with the files in
   `assets/`. The export inlines about 950KB of duplicates.
3. Re-apply the `.ty-wordmark` media query. Without it the header wordmark
   overlaps the phone number on phones, which is how the page first arrived.

If the timetable, prices or route list change, update `sitemap.xml` to match
and run `npm test`.

There is a fuller design reference — tokens, colour values, React gotchas — in
`design_handoff_knight_fitness_site/README.md` in the design project.
