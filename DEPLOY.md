# Knight Fitness Morayfield — deploy notes

Static site. No build step, no npm install, no framework. Every file in this
folder is served as-is.

## Contents

| File | Purpose |
|---|---|
| `index.html` | The whole site — all 8 pages live in here |
| `thank-you.html` | Confirmation page for the 3-day pass form, served at `/thank-you`. Not part of the router |
| `message-received.html` | Confirmation page for the contact form, served at `/message-received`. Not part of the router |
| `42-hard.html` | Landing page for the 42 Hard challenge, served at `/42-hard`. Not part of the router |
| `support.js` | The runtime `index.html` depends on. Required. Do not rename |
| `assets/` | 28 optimised images + favicons + OG card, plus the vendored React build in `assets/vendor/` |
| `vercel.json` | Rewrites, 301 redirects from the old URLs, cache headers, and `framework: null` + `installCommand: ""` so Vercel never runs the dev-only `package.json` |
| `robots.txt` | Crawl permission + sitemap pointer |
| `sitemap.xml` | All 9 indexable URLs |
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

**The `/thank-you`, `/message-received` and `/42-hard` rewrites in
`vercel.json`, and their position.** All three have to stay ahead of the
`/(.*)` catch-all. Vercel takes the first matching rewrite, so if the catch-all
comes first every visitor who just submitted a form gets the home page instead
of the confirmation, and every ad click on `/42-hard` lands on the home page.

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
| `/message-received` | Confirmation page after the contact form. A real file, not a route |
| `/42-hard` | 42 Hard challenge registration page. A real file, not a route |

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
- **Content gap:** the 6 Week Challenge page states no price. `/42-hard` does
  — $350 for members, $700 for non-members — but only for that block; the
  evergreen challenge page still routes the question to an enquiry form.
- **The 42 Hard export was partial.** Its component logic carries copy for
  prize, rules, inclusions and timeline sections that the exported markup never
  renders, and two scroll handlers pointing at `#prizes` and `#rules`, which do
  not exist. The dead data is not in `42-hard.html`. If those sections are
  wanted, they have to come from a fresh export of the design file.

## Editing

`index.html` is generated from `Knight Fitness Morayfield.dc.html` in the design
project. Small copy and price edits are safe to make directly in `index.html`.
Anything structural is better done in the design file and re-exported, or the
two drift apart.

Three things in `index.html` are not in the design file and must be re-applied
after a re-export (the static test suite fails if any is missing):

1. The two `assets/vendor/react-*.js` script tags before `support.js` in `<head>`.
2. Absolute `https://knightfitness-morayfield.com.au/...` URLs in the
   `og:image` and `twitter:image` meta tags. The design export writes them
   relative, which social previews reject.
3. The `fileHrefFor` helper and the `h42Hard` value in `renderVals`, plus the
   paragraph in the 6 Week Challenge hero that links to `42 Hard`. `/42-hard` is
   a file rather than a route, so it cannot go through `hrefFor`; `fileHrefFor`
   is what keeps the link working when `index.html` is opened as a bare file.

`thank-you.html`, `message-received.html` and `42-hard.html` came from separate
standalone exports and have the same problem in a different form. If any is
re-exported, redo these three things, all of which the test suite enforces:

1. Replace the bundled runtime script with the site's own React, ReactDOM and
   `support.js` tags.
2. Replace the inlined fonts, logo and photos with the files in `assets/`, and
   the inlined LeadConnector embed script with the runtime injection in the
   page's `mountFormResizer`. The exports inline about 1.5MB of duplicates
   between them.
3. Re-apply that page's own fixes. For the confirmation pages that is the header
   fix — `flex-shrink: 0` on the logo anchor plus the `.ty-wordmark` media
   query — without which the wordmark overlaps the phone number on phones. For
   `42-hard.html` it is the four rows in the table in
   [README.md](README.md#the-42-hard-landing-page): the real form URL in the
   iframe `src`, the injected embed script, the `+10:00` kickoff instant and the
   shrinkable grids.

Adding a further standalone page means adding one entry to `CONFIRMATION_PAGES`
or `LANDING_PAGES` in `tests/helpers.mjs`, one rewrite and one cache header in
`vercel.json`, and — for a landing page — one `<loc>` in `sitemap.xml` and a link
to it from `index.html`. The tests are driven off those lists.

## The 42 Hard challenge

`/42-hard` takes registrations for the block running 26 October – 5 December
2026. Registrations go to the "In House 6 Week Challenge Registration Form
Morayfield" form in LeadConnector (`F6YrDPqkBDSVHapalvQF`), not to either of the
forms the rest of the site uses.

The spots counter, the registration close date and the kickoff instant are
constants at the top of the page's script block: `SPOTS_LEFT`, `SPOTS_TOTAL`,
`CLOSE_LABEL` and `KICKOFF`. Change `KICKOFF` and the `startDate` in the
schema.org block together — a test fails if they disagree. The countdown hides
itself once the kickoff has passed.

Retiring the page after the challenge means deleting `42-hard.html`, its entry
in `LANDING_PAGES`, its rewrite and cache header in `vercel.json`, its `<loc>`
in `sitemap.xml`, and the `h42Hard` paragraph in the 6 Week Challenge hero. Do
not leave it up and unlinked: a live page advertising a finished challenge with
a countdown at zero is worse than no page.

If the timetable, prices or route list change, update `sitemap.xml` to match
and run `npm test`.

There is a fuller design reference — tokens, colour values, React gotchas — in
`design_handoff_knight_fitness_site/README.md` in the design project.
