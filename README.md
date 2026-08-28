# fbwstompers.com — static rebuild

Static HTML rebuild of the Elementor/WordPress site at https://fbwstompers.com.
No framework and no dependencies — a small Python build script and plain CSS.
Host-agnostic: the output is a folder of static files.

## Build and run

```bash
python3 build.py --serve
```

Builds into `dist/` and serves it at http://127.0.0.1:8787/. Plain `python3
build.py` just builds. No dependencies, no package manager.

`dist/` is generated and gitignored — never edit it. Everything is authored in
`src/`.

## Layout

```
build.py                Static build. ~200 lines, no dependencies.
src/
  layout.html           Page skeleton with {{placeholders}}
  partials/             header.html, footer.html, lightbox.html
  schema/               JSON-LD nodes; band.json is on every page
  pages/                One file per page: front matter + <main>
assets/
  css/site.css          Design tokens + all component styles
  js/main.js            Progressive enhancement only — pages work without it
  fonts/                Self-hosted Limelight + Jost, latin subset (91 KB)
  img/                  Responsive webp + jpg at 640/1024/1600
  img/orig/             Untouched originals. Committed, not deployed.
data/events.json        Gig data — see "Events" below
dist/                   Generated output. Gitignored.
_source/                Reference only. Not deployed.
  pages/*.json          Raw page content from the live WP REST API
  text/*.md             Readable copy extracted from those pages
  images.py             Regenerates assets/img from assets/img/orig
                        (auto-discovers — see "Adding a photo")
```

## Adding a page

Create `src/pages/<name>.html`:

```
title: Weddings | Foggy Bottom Whomp-Stompers
description: One sentence, ~155 characters, written for a search result.
url: /services/weddings/
nav: services
schema: band, service-weddings
lightbox: no
---
<main id="main">
  ...
</main>
```

`url` decides the output path — `/about/` becomes `dist/about/index.html`, so
URLs stay clean without server rewrites. `nav` marks the matching header link
with `aria-current="page"`; the key must match a `data-nav` attribute in
`src/partials/header.html`. `schema` is a comma-separated list of files from
`src/schema/`; `band` should be on every page. Set `lightbox: yes` only on
pages with video thumbnails.

Optional keys: `og_title`, `og_description`, `og_image`, `og_image_alt`,
`og_type`. They fall back to the page title and description.

### What the build checks

- Every required front-matter key is present, and `url` is well-formed
- No two pages claim the same `url`
- No unresolved `{{placeholders}}` survive into the output
- `nav` matches a real link in the header
- **Every referenced `/assets/…` file exists — a missing image fails the
  build.** `srcset` candidates are checked too, not just `src`
- Internal links to pages that don't exist yet are reported as warnings, so
  unbuilt pages show up as a to-do list rather than silent 404s

It also writes `sitemap.xml` and `robots.txt` from the page list.

## Adding a photo

Two steps:

```bash
# 1. put the photo in assets/img/orig/  (any filename — spaces and capitals are fine)
# 2. generate the responsive sizes
python3 _source/images.py
```

The output name comes from the filename, slugified: `Tented Reception 2026.jpg`
becomes `tented-reception-2026-640.webp`, `-1024.webp`, `-1600.webp` and matching
`.jpg` fallbacks. **There is no list to update** — every image in `orig/` is
discovered automatically. The `RENAME` table in `_source/images.py` exists only
to give better names to legacy files like `IMG_5036-scaled.jpg`.

Then reference it in a page with a `<picture>` block (copy the shape from any
existing page) and commit **both** the original and the generated variants.

### Why originals are committed

`assets/img/orig/` is in git. Cloudflare rebuilds `dist/` from scratch on every
push, so anything not in git doesn't exist in production — and keeping the
originals means the variants can always be regenerated from source, at
different sizes or quality, without hunting for the master files.

### Three guards against the common mistakes

- **Photo added but not processed.** The build lists any original in `orig/`
  with no generated variants, and prints the command to fix it. Nothing else
  catches this, because the page markup referencing it usually doesn't exist yet.
- **Page references an image that doesn't exist.** The build *fails*, checking
  `srcset` candidates as well as `src`. This caught a real bug — a page pointing
  at `band-live-*.jpg`, a filename that was never generated.
- **Two photos producing the same output name.** `_source/images.py` stops with
  an error rather than letting one silently overwrite the other's variants.

Regeneration is deterministic: re-running the script on unchanged sources
produces byte-identical files, so it never creates noise in `git status`.

## Design

Geometric sans (**Jost**) for everything that carries running text, **Limelight**
for the logotype, `h1`, `h2` and the step numerals only. Cool neutral blacks,
warm cream on the light sections, 8–12px corners, sentence-case buttons.

Font payload is **91 KB across 4 faces** (Limelight 400, Jost 300/400/500),
self-hosted latin subset.

Sections alternate dark → cream → dark → cream → dark.

> Earlier variants A (Limelight + Lato, warm browns, deco fan pattern) and B
> (Josefin Sans + Jost) have been deleted along with their stylesheets and
> unused font files. `assets/img/deco-fan.svg` is kept — it's 700 bytes and
> would still work as a texture if wanted later, but nothing references it now.

## Design tokens

| Token | Value | Role |
| --- | --- | --- |
| `--ink-900` | `#0a0a0c` | page background |
| `--ink-800` | `#0c0c0e` | alternate dark section, footer |
| `--ink-700` | `#161618` | CTA, raised surfaces |
| `--gold` | `#c9a84c` | headings and accents **on dark** — 8.66:1 |
| `--gold-bright` | `#dcc07a` | hover on dark |
| `--gold-dark` | `#80661f` | headings and accents **on cream** — 4.90:1 |
| `--cream` | `#f2f0eb` | body text on dark |
| `--muted` | `#b8b5ae` | secondary text **on dark** — 9.66:1 |
| `--muted-dark` | `#5a5751` | secondary text **on cream** — 6.45:1 |
| `--paper` | `#f7f2e7` | light section background |
| `--rule` / `--rule-dark` | 12% cream / 14% ink | hairlines, light and dark |

The gold and muted greys come in light/dark pairs on purpose. The single values
inherited from the reference draft measured **2.29:1** and **2.05:1** on a light
background — the pairs exist so nothing falls below 4.5:1 in either context.

Every foreground/background pair on the page passes WCAG AA for normal text.
The lowest is 4.53 (the CTA heading measured against a hypothetical all-white
video frame under its scrim).

## Interior-page header banner

Every `.page-head` (13 pages — everything except the homepage, which has its
own hero) carries a decorative background: a public-domain antique book-cover
scan — gold linework on navy — rotated 90&deg; from its original portrait
orientation into a landscape band. Source: Magda Ehlers, Pexels
(pexels-photo-12787690), free-to-use license, credit appreciated but not
required.

**Applied as pure CSS**, not markup — one rule in `site.css` (`.page-head::before`
/ `::after`) reaches all 13 pages, so nothing needed changing in `src/pages/`.
Two widths (900w / 1800w mobile/desktop breakpoint), webp only — see
`WEBP_ONLY` in `_source/images.py` for why a jpg fallback wasn't worth
generating for a 100%-decorative image.

**The gradient overlay's stops are pinned to fixed rem values, not
percentages.** The risk: the pattern's brightest highlight
(`rgb(220,201,171)`, a pale gold) is close enough to `--gold` text color that
gold-on-pattern can fail contrast outright — measured as low as 1.77:1 at the
opacity that keeps the pattern visible. Page-head height varies with how much
text a given page has, so a percentage-based gradient would put text in a
different part of the fade on every page. `padding-top` on `.page-head`
doesn't vary, though — so the gradient reaches AA-safe opacity (0.92, measured
at 7.66:1 against that same worst-case pixel) exactly at `9.25rem`, the padding
value, which is where text starts on every page regardless of length. Above
that line is pure padding on every page — never has text on it — so it's safe
to leave the pattern more visible there.

If you change `padding-top` on `.page-head`, update the `9.25rem` stop in
`.page-head::after` to match, or the safety margin no longer lines up with
where text actually starts.

## Homepage section notes

**Offerings section.** Started as six boxed cards with icons plus a three-photo
strip, which was too much weight for a secondary section. Now: a full-width
heading, then a two-column split — a rotating photo carousel on the left, the
six event types as a hairline-ruled list on the right. The "our fee is
denominated in 1920s currency" line was cut.

**Photo carousel.** `assets/js/main.js`, crossfade, no dependencies. Rotates
the three photos every 5.2s and pauses on hover, on focus, when the tab is
hidden, and entirely under `prefers-reduced-motion`. Dots are hidden until JS
wires them up, and without JS the first slide simply stays put — the section is
never blank. Add or remove slides by editing the markup; the script counts them.

**Video lightbox.** Clicking a thumbnail opens the embed large and centred in a
native `<dialog>` — roughly 9× the tile area on desktop (381×214 → 1176×661).
Using the platform dialog means focus trapping, Esc-to-close and an inert
background come for free. The iframe is built on open and destroyed on close,
which is what actually stops playback. Browsers without `<dialog>` fall back to
playing in place. On short or landscape viewports the panel is capped by height
so the video never overflows.

**Header.** Three grid tracks — `1fr auto 1fr` — with the brand wordmark left,
the link list centred and Book us right. The outer tracks are equal, so the
links centre on the header itself rather than on whatever space the wordmark
leaves. On desktop the `<nav>` box is dissolved with `display: contents` so its
two children can occupy separate tracks; below 60rem the `<nav>` becomes the
slide-down panel again and the header drops to two tracks. Verified that
`display: contents` does not drop the `navigation "Primary"` landmark from the
accessibility tree.

There is no logo image in the header — the wordmark is text. `favicon-192.png`
is still wired up as the browser tab icon.

**Alternating backgrounds.** dark → cream → dark → cream → dark. "From hello to
the downbeat" sits on cream so four dark sections don't run together.

## Service pages

`/services/` plus six pages: weddings, parties, corporate, dances, festivals,
send-offs. Linked from the header, the footer, and the homepage list.

These are the pages meant to win search traffic, so the risk to manage is
**doorway pages** — six near-identical pages differing only by keyword, which
Google's spam policies explicitly penalise. Every page is built only from facts
the client supplied or that already appear on the live site; no invented
venues, statistics, prices or testimonials.

Measured content overlap between the six is **11.3% at worst** (Jaccard on
3-word shingles). Anything above ~35% would start reading as templated.

Re-run that check after editing any service page:

```bash
python3 - <<'EOF'
import re, pathlib, itertools, html
pages = {}
for f in sorted(pathlib.Path('dist').glob('services/**/index.html')):
    body = re.search(r'<main.*?</main>', f.read_text(), re.S).group(0)
    w = re.sub(r'[^a-z0-9 ]', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', body)).lower()).split()
    pages[f.parent.name] = set(zip(w, w[1:], w[2:]))
for a, b in itertools.combinations(sorted(pages), 2):
    j = len(pages[a] & pages[b]) / len(pages[a] | pages[b])
    if j > 0.2: print(f'{a} vs {b}: {j:.1%}')
EOF
```

**The send-offs page is deliberately different in tone.** Someone reading it has
probably just lost somebody. No exclamation marks, no urgency, no "book early",
no photograph, and the email address is offered as prominently as the form.
Keep it that way if you edit it.

**Two capabilities surfaced in the client's notes that weren't anywhere on the
old site**: the band provides its own PA system and can supply an MC. Both are
now on the weddings page, the services hub, and several other pages.


**Nav dropdown.** "Services" in the header now opens the same way "About"
does — hover or focus reveals a submenu listing all six. Desktop uses
`:focus-within`/`:hover` on `.nav__item--has-sub`; mobile expands it inline in
the slide-down panel (verified by forcing `:focus-within` via `.focus()` in
JS — coordinate-based synthetic hover isn't reliable in headless testing, but
`:focus-within` is the real CSS mechanism and also what keyboard users
actually trigger).

Each of the six pages has its own `nav:` front-matter value
(`services-weddings`, `services-parties`, etc.) matching a `data-nav` key in
`header.html`, so the specific sub-link gets `aria-current`, not just the
"Services" parent — same pattern as `about/configurations/` and
`about/repertoire/`. The hub page (`services.html`) keeps `nav: services`,
highlighting the parent, matching how `about.html` behaves.

## Events

`data/events.json` is the source of truth until the Google Calendar exists.
Its `_schema` key documents the field shape.

Once the calendar exists, a build step fetches the calendar's public `.ics`,
regenerates `events.json`, and rebuilds the event markup — so the page's
consumption contract does not change. Events are rendered into static HTML
rather than fetched client-side, so they stay indexable.

**Not yet wired up.** `/events/` currently renders an empty state pointing at
Instagram and Facebook. Once the calendar exists, the build will generate the
event list into that page.

## Ambient background video

The CTA section ("Let's talk about your event") carries the YouTube background
video from the old site: `lxGdBM3V0fw` — *FBWS 0211 Engine Company 12 Speakeasy
Set 3* — starting at 1033s, the same in-point Elementor used.

It is decorative, so it has to earn its bandwidth. `main.js` skips the embed
entirely when any of these hold:

- `prefers-reduced-motion: reduce`
- viewport ≤ 48rem (phones get the poster only)
- `hover: none` — autoplay on touch devices is unreliable
- `navigator.connection.saveData`
- `effectiveType` of `2g` or `slow-2g`

Otherwise it loads on an IntersectionObserver with a 200px margin, so it costs
nothing until the section is nearly in view, and fades in over the poster.

`assets/img/cta-poster-*` sits underneath at all times, so the section is never
blank and never depends on the embed. Every skipped case above degrades to a
still frame that looks intentional.

**Difference from the old site:** Elementor looped a 22-second slice
(1033s → 1055s). Doing that requires the YouTube IFrame Player API polling
`currentTime` and seeking back. This version starts at 1033s and plays on,
looping the video from that in-point — no API, no extra JS. If the exact slice
loop matters, the options are the YT API (~heavier) or a self-hosted clip.

**A self-hosted MP4/WebM would be strictly better** — no third party, no
cookies, exact loop control, works on mobile — but extracting the clip needs
`yt-dlp` and `ffmpeg`, neither of which is installed here.

Contrast over video was checked against a hypothetical all-white frame under
the 0.78 scrim: the heading and buttons clear AA at 5.26, and the small
eyebrow/lede text is lifted to `--gold-400` / `--sand-100` so they clear AA too
(6.30 and 7.82) rather than sitting at 3.17 in the worst case.

## Unused: art-deco fan pattern

`assets/img/deco-fan.svg` is a seamless fan/scallop tile built for the deleted
variant A, where it sat behind the cream section at low opacity. **Nothing
references it now.** Kept because it's 700 bytes and would still work as a
texture. To use it again, add a masked `::before` to `.section--paper`.

> Gotcha worth remembering: a `--` sequence anywhere inside an XML comment is a
> parse error, and a browser will silently refuse to render the whole SVG as an
> image. Don't write CSS custom property names in SVG comments.

## Adapted from the roof.fbwstompers.com draft

Two sections were adapted from that draft: the six event types (replacing three)
and the four-step booking process.

**Everything else on that draft is unverified or invented and was deliberately
left out:**

- Three testimonials attributed to named people ("Eleanor & Jude", "Marcus
  Vane", "Priya Raman"). These appear to be fabricated. Publishing invented
  testimonials as genuine customer quotes is deceptive and a legal risk.
- Statistics: "500+ Nights Played", "4 States Served", "3–8 Piece
  Configurations".
- Contact details: `(202) 555-0127` is a reserved fictional number,
  `PO Box 1925, Washington, DC 20037`, and `fbwstompers@gmail.com` — the real
  address is `hello@fbwstompers.com`.

The six event types here are grounded in claims the live site already makes.
The Kennedy Center / Woodrow Wilson House / Torpedo Factory and Washington Folk
Festival references come from the real About and Media pages.

**Confirm before launch:** the step 3 copy says "a simple written agreement
holds your night, with the price settled up front." The draft claimed a
two-business-day response time and a deposit; both were omitted because they're
commitments only you can make.

## Contact / booking

**These are one page.** `/contact/` carries the enquiry form, the "what to
include" list, and the contact details. There is no `/booking/` page — the old
site had the *same Google Form* on both, which meant two pages competing for
the same searches.

The form is the existing Google Form
(`docs.google.com/forms/d/e/1FAIpQLSfwS4mx…`), so responses keep landing in the
current spreadsheet. `main.js` defers the iframe until it scrolls into view so
its ~300 KB of Google JS doesn't slow down first paint.

The header keeps both a "Contact" link and a "Book us" button pointing at the
same page — the button is the visual call to action, and only the nav link
takes `aria-current`.

## Redirects

`REDIRECTS` in `build.py` emits `dist/_redirects` in Netlify / Cloudflare Pages
format. Cloudflare Workers static assets honors the same file — **verified live
after cutover**, `/booking/` → `/contact/` and `/gigs/` → `/events/` both return
301. `/booking/` was live on the old WordPress site, so that redirect is what
preserves its ranking and inbound links.

Current map:

| Old | New | |
| --- | --- | --- |
| `/booking/` | `/contact/` | merged |
| `/gigs/` | `/events/` | unlinked "gig tracker" page |

**Still to decide:** the old site also has an unlinked `/payment/` page. I don't
know whether it's still needed, so it has no redirect yet — it currently 404s in
production. If it's dead, point it at `/contact/`; if it's live, it needs
rebuilding.

If you ever deploy somewhere without `_redirects` support (plain Apache), these
need translating into `.htaccess` rules instead.

## Status

- [x] Content + media extracted from the live site
- [x] Design tokens, fonts, responsive images
- [x] Home
- [x] Ambient background video on the CTA section
- [x] Art-deco pattern on the cream section
- [x] Six event types + four-step booking process
- [x] Removed the Upcoming events section from the homepage
- [x] Variant B for side-by-side comparison
- [x] Variant C — B's system with Limelight kept for display (recommended)
- [x] Variant C chosen; cream, editorial offerings section, alternating backgrounds
- [x] Fixed `<picture>` height collapse breaking the mobile hero (all variants)
- [x] Deleted variants A and B; C promoted to `index.html` / `site.css`
- [x] Photo carousel in the offerings section
- [x] Video lightbox
- [x] Shared template + build step (`build.py`, `src/`)
- [x] About, Band configurations, Repertoire, Media, Events, Contact, Booking
- [x] `/services/` hub + 6 service pages
- [x] Decorative header banner on all 13 interior pages
- [ ] Real lineups for the six example configurations (the old page left them empty)
- [ ] Google Calendar → events pipeline
- [x] sitemap.xml + robots.txt (generated by the build)
- [x] 301 redirect map (`dist/_redirects`) — `/payment/` still undecided
- [x] Host selection + deploy — Cloudflare Workers, live on the real domain
      Aug 9, 2026. See CLAUDE.md for the full infrastructure map.
- [x] Cloudflare Email Routing live; `hello@fbwstompers.com` sends and receives
- [x] SiteGround deactivated Aug 9, 2026 — mailboxes checked, nothing to keep
      (no WordPress backup was taken; that window has closed)

## Notes on the old site

Things worth not reproducing:

- The homepage `<h1>` is **empty**; the band name is an `<h2>`. Fixed here.
- Noun Project image attributions leak into visible body copy.
- "Some recent videos", "Upcoming events", and "Other news" render as headings
  with nothing under them, on every page.
- `/about/configurations/` says "It start with the core" and lists
  "trio, quartet, quartet, sextet, septet, or octet" — a duplicated quartet and
  a missing quintet. Then it shows three sections all headed "Quintet:".
- The Unsplash stock photos in the media library appear to be unused template
  leftovers. All photos used here are real band photos.
- `/gigs/` and `/payment/` exist but are not linked from the navigation.
