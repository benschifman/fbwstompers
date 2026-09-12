# Rebuilding a small business website as a static site — playbook

This is the process used to rebuild fbwstompers.com from an Elementor/WordPress
site into a fast, hand-written static site on Cloudflare. It is written for a
fresh Claude Code session starting a **new** site, with Ben as the client.

**Copy this file into the new project's folder as `CLAUDE.md`** so it loads
automatically. Once the site exists, replace it with project-specific docs.

The finished FBWS project at `~/Documents/FBWS` is a complete reference
implementation. **Reuse its tooling rather than rewriting it** — `build.py`,
`_source/images.py`, the `src/` layout, and the CSS architecture all transfer
directly. Read its `README.md` and `CLAUDE.md` before starting.

---

## How to work with Ben

Ben is not a developer. He has good design instincts, gives clear feedback, and
will tell you when you're overthinking something. Some things that matter:

- **Ask the decisions that change the work; make the routine calls yourself.**
  Design ambition, hosting, forms, and how dynamic content gets updated all
  genuinely fork the project — ask those up front. Don't ask about things with
  an obvious default.
- **Show, then ask.** A styled homepage to react to beats a paragraph
  describing one. Build the first page before building the system.
- **Never invent facts about the business.** No venues, statistics, prices,
  dates, testimonials, or capabilities that aren't already on the site or
  supplied by Ben. If a page needs substance you don't have, ask for it
  rather than padding. Ben will send notes; wait for them.
- **Verify before you report.** Don't say something works because the code
  looks right. Curl it, measure it, screenshot it. Several of the worst
  moments in the FBWS build came from reporting confidently from reasoning
  instead of checking.
- **When Ben says it still looks wrong, believe him and measure the thing he
  is looking at**, not the thing you were already measuring. The Facebook icon
  took three rounds because two of them measured the glyph inside the icon
  when the problem was the circle around it.

---

## Phase 0 — Reconnaissance (before proposing anything)

Get the current site's URL. Then:

1. **Check for an open WordPress REST API**: `https://<site>/wp-json/wp/v2/pages`.
   If it responds, that is the cleanest content extraction available — pull
   every page's rendered HTML and the full media library
   (`/wp-json/wp/v2/media?per_page=100`) into a `_source/` folder. No scraping.
2. **Extract the real design tokens from the live CSS**, not from guesses:
   fonts actually loaded (`getComputedStyle` in the browser is more reliable
   than reading the stylesheet), Elementor's `--e-global-color-*` variables,
   the palette in use. FBWS turned out to load five font families and carry
   leftover stock-template colors that were never used deliberately.
3. **Screenshot the live site** and note what's actually wrong. Common finds:
   an empty `<h1>` (the band name was an `<h2>`), sections rendering as bare
   headings with nothing under them, stock Unsplash photos mixed with real
   ones, image-attribution text leaking into visible copy, typos, and the
   same form embedded on two pages competing for the same search.
4. **Inventory what's real.** Which photos are of the business vs. stock
   (Unsplash files have photographer-name filenames). Which pages are linked
   from the nav vs. orphaned. Which embeds — forms, calendars, video — exist
   and where they point.
5. **Check any other drafts Ben has.** He may have a second install or an
   AI-generated redesign. Treat those as design references, but audit their
   content: the FBWS one had fabricated testimonials with invented names, a
   `555` phone number, and a wrong email address. Never carry that forward.

Present findings before proposing a plan.

## Phase 1 — Decisions (ask these, they fork the work)

Use a single multi-question prompt. The ones that mattered:

- **Design ambition** — faithful modernization / refreshed same-family /
  full redesign. Ben chose "refreshed same-family" and it was the right call.
- **Hosting** — recommend Cloudflare. It's free, deploys on git push, handles
  redirects, and can run a build. Ben may not know yet; build host-agnostic.
- **Forms** — if the site already uses a Google Form, keep it. Responses stay
  in the existing spreadsheet, it works on any host, and the only cost is
  that you can't style inside the iframe. Lazy-load it.
- **Dynamic content** (events, gigs, news) — how does Ben want to update it?
  A calendar feed needs a build step. A data file needs him to edit JSON. If
  the source doesn't exist yet, build the page against a contract and wire
  it later.

## Phase 2 — Design foundation, then ONE page

Do this before any templating:

1. **Photos.** Download the real ones. Build a responsive pipeline
   (copy `_source/images.py`): webp + jpg at 640/1024/1600, quality tuned
   per use, auto-discovery so adding a photo is drop-file-and-run. Keep
   originals committed in `assets/img/orig/`.
2. **Fonts.** Self-host, latin subset, woff2. Cut to two families. Fetch the
   Google Fonts CSS with a modern browser User-Agent to get woff2 URLs. FBWS
   went from five families to two at 91 KB total.
3. **Tokens.** CSS custom properties for color, type scale, spacing, radius.
   Keep the client's real brand color; drop leftovers.
4. **Contrast — measure every pair, don't eyeball.** Write the WCAG formula
   in Python and run it. Colors that work on dark almost always fail on light
   (FBWS's reference gold measured 2.29:1 on white). Keep light/dark *pairs*
   of each accent so nothing drops below 4.5:1. When text sits over an image
   or video, test against the **brightest pixel** in the image, not the
   average — sample it with PIL.
5. **Build the homepage only.** Get Ben's reaction. Expect several rounds:
   section removed, section redesigned, a carousel added, a video background
   restored from the old site. Keep iterating on one page until it's settled.

**Variants work well for design comparison.** FBWS built A/B/C with a small
fixed switcher so Ben could flip between them. Rule: identical content and
markup, only the stylesheet differs, so the comparison is purely visual. C was
B's system with the period display font restored only for headings — the
hybrid nobody would have specified up front. Delete the losers and the switcher
once he chooses.

## Phase 3 — Template and build step

Only after the homepage is approved. Copy from FBWS:

- `src/layout.html` — skeleton with `{{placeholders}}`
- `src/partials/` — header, footer, anything shared
- `src/schema/` — JSON-LD nodes; the business entity goes on every page
- `src/pages/*.html` — front matter (`title`, `description`, `url`, `nav`,
  `schema`) above `---`, then `<main>`
- `build.py` — renders to `dist/`, which is gitignored

Extract the approved homepage into this structure and **verify the build
reproduces it byte-for-byte** (normalize asset version strings) before
deleting the hand-written file.

`build.py` must **check things**, because silent failures shipped real bugs:

| Check | Severity | Why it exists |
| --- | --- | --- |
| Referenced asset missing (incl. `srcset`) | fail | A page pointed at an image name that was never generated |
| Duplicate `url`, malformed `url`, unknown `nav` key | fail | Structural |
| Unresolved `{{placeholder}}` | fail | Structural |
| Title > 65 or description outside 70–165 chars | warn | Two titles were 72 chars and would have truncated |
| Photo in `orig/` with no generated variants | warn | Someone dropped a file and forgot the image script |
| Internal link to a page that doesn't exist | warn | Doubles as the to-do list of unbuilt pages |

Also generate `sitemap.xml`, `robots.txt`, and `_redirects` from the page list.

## Phase 4 — The remaining pages

Two kinds, handled differently:

**Pages whose content already exists** (About, Media, Contact, and the like):
build these yourself from the extracted content. Fix what was wrong in the
original — typos, empty sections, the duplicated form. Merge pages that
compete (FBWS folded Booking into Contact and 301'd the old URL).

**Pages meant to win search traffic** (service/landing pages): these are
where the money is and where the risk is.

- Get **Ben's real notes first**. A few sentences of operational truth per
  page ("we bring a PA system and an MC") is worth more than any amount of
  polished prose, and it surfaced capabilities that weren't on the old site
  at all.
- Write **one exemplar page yourself** to set the shape.
- Then **fan out Sonnet subagents**, one per page, with a tight brief: the
  exemplar as reference, the *only* facts they may use quoted verbatim, an
  explicit list of things they must not invent, the exact image paths they
  may reference, the CSS classes that exist, and instructions to keep it
  short rather than pad. Don't run agents before the template exists — they
  drift.
- **Measure doorway-page risk.** Near-duplicate pages differing only by
  keyword get penalized. Compute pairwise overlap (Jaccard on 3-word
  shingles) across the set; FBWS came in at 11% worst-case. Above ~35% is a
  problem.
- **Scan for fabrication**: numbers, prices, quotes, proper nouns not in the
  approved set. Fix British spellings. Check tone on any page where tone is
  the whole point (the funeral page got a different brief: no exclamation
  marks, no urgency, no photo).

Wire the new pages into the nav (dropdowns for grouped pages), the footer,
and any list on the homepage that names them.

## Phase 5 — Deploy and cut over

Ben will do the account-side steps; you guide and verify.

1. **Repo** on GitHub. `dist/` gitignored, originals committed.
2. **Cloudflare.** New projects default to **Workers**, not Pages. That means:
   `wrangler.jsonc` with `assets.directory: "dist"` is required, and the
   build command (`python3 build.py`) is set in the dashboard *separately*
   from the deploy command. Two FBWS deploys failed before this was right.
   `_redirects` works on Workers static assets.
3. **Redirects** for every old URL that won't exist, or their rankings and
   inbound links are lost on cutover.
4. **DNS.** Nameservers to Cloudflare at the registrar; custom domains bound
   at the Worker (delete the old host's A records first or Cloudflare refuses).
5. **Email.** If the old host ran the mailbox, that breaks silently at
   cutover. Cloudflare Email Routing receives for free; sending goes through
   Gmail "Send mail as" with `smtp.gmail.com:587`, the Gmail address as
   username, and an app password. SPF must include both
   `_spf.mx.cloudflare.net` and `_spf.google.com`. Delete the old provider's
   MX records by hand. Read the FBWS `CLAUDE.md` email section — it cost an
   hour to diagnose mail that reached nobody.
6. **Verify with curl, not the browser.** Stale DNS showed the old site for
   hours after the deploy was fine. `curl -sI https://<site>/` and check
   `server: cloudflare`. Then check that a specific recent change is present
   in the served HTML.
7. **Cancel the old host** only after confirming its mailboxes hold nothing
   and taking any backup you'll want. FBWS never took a WordPress backup and
   the window closed.

After this, **every `git push` publishes to the live site.** Say so at the
top of the project's `CLAUDE.md` in bold.

## Phase 6 — Documentation

- **`CLAUDE.md`** — auto-loaded, so keep it short and put the highest-stakes
  fact first (pushing publishes). Edit `src/` not `dist/`. The photo workflow.
  Which build messages are hard failures. House rules learned from real bugs.
  Open questions for Ben. Everything that changes behavior, nothing else.
- **`README.md`** — the depth. Tokens with measured ratios, how each section
  works, the reasoning behind non-obvious decisions.
- **Memory** — save facts that are invisible in the repo. That a push deploys
  is not visible from the code; it had to be discovered by curling the site.

---

## Rules learned the hard way — don't relearn them

**Layout and CSS**
- `<picture>` is inline; `height: 100%` on the `<img>` inside collapses to
  intrinsic height. The hero photo stopped halfway down on every phone. Set
  the `<picture>` to `display: block; height: 100%` wherever you rely on cover.
- A `--` anywhere inside an XML comment is a parse error and the browser
  silently refuses to render the SVG. Don't write CSS variable names in SVG
  comments.
- An HTML comment inside a flex or grid container splits the whitespace into
  two text runs and adds a phantom line box. Keep comments outside those
  containers.
- A blanket `li + li { margin-top }` written for a vertical list will also hit
  any horizontal list under the same parent. The first item is exempt (no
  preceding sibling), so it looks like *that* item is misaligned when the
  rest are being pushed down.
- Write components dark-first with light-section overrides, or the reverse,
  but pick one — mixing rendered near-black text on a near-black section on
  three pages.
- `display: contents` on a `<nav>` to let its children occupy separate grid
  tracks is fine, but verify the landmark survives in the accessibility tree.
- Bump the asset cache-buster on every CSS/JS change or returning visitors
  keep the old file. Forgetting this is why a fix "didn't work" locally once.

**Verification**
- The browser-pane screenshot tool does not composite lazy-loaded images and
  throttles `IntersectionObserver`. A blank image in a screenshot is not
  evidence of a bug. Confirm with `img.complete`, or draw it to a canvas and
  sample pixels.
- Synthetic hover doesn't reliably trigger `:hover`. Test dropdowns with
  `.focus()` and `:focus-within`, which is also what keyboard users get.
- Don't chain hover/tab/screenshot calls on one long-lived tab; it drifted to
  other pages mid-test and produced confusing results. Re-navigate cleanly.

**Content and SEO**
- One `<h1>` per page. Titles ≤ 60 chars, descriptions 120–160.
- Every external link gets `rel="noopener"`.
- Video embeds: don't load YouTube's player on page load. Use a poster image
  and load on click (or on scroll for a background), and skip it entirely
  under reduced-motion, save-data, and on phones.
- Video lightbox: native `<dialog>` gives focus trapping and Esc for free.
  Destroy the iframe on close — that's what actually stops playback.
- Decorative header banners: a gradient overlay pinned to fixed `rem` stops
  matching the header's `padding-top`, not percentages, so it reaches
  AA-safe opacity exactly where text starts regardless of page length.

---

## Open items to carry into a new project

Ask about these early rather than discovering them at cutover: whether the
old host runs the mailbox; whether there are unlinked pages (`/payment/`,
`/gigs/`) that need redirects or rebuilding; whether Ben wants a backup of the
old site before it's cancelled.
