# fbwstompers.com

Static site for a working Washington, DC jazz band. Plain HTML/CSS, a small
Python build script, no framework and no dependencies.

## ⚠️ Pushing to `main` publishes to the live public website

`git push` → Cloudflare rebuilds and deploys → **https://fbwstompers.com is
updated within a minute or two.** There is no staging step and no preview
gate. This is a real business's site that real clients use to book the band.

Treat every push as a publish. Build and check locally first; don't push
speculative or half-finished work.

The Cloudflare git integration and its build command live in the Cloudflare
dashboard, not in this repo — nothing here reveals that it's wired up. It is.

## Edit `src/`, never `dist/`

- **`src/`** — the real source. Pages, partials, JSON-LD schema. Committed.
- **`dist/`** — generated output, gitignored, wiped and rebuilt every time.
  Editing it does nothing; the change vanishes on the next build.

Cloudflare regenerates `dist/` from git on every push, so **anything not
committed does not exist in production.**

```bash
python3 build.py           # build into dist/
python3 build.py --serve   # build, then serve at http://127.0.0.1:8787/
```

## Adding a photo

```bash
# 1. drop the file in assets/img/orig/   (any filename — spaces/capitals fine)
# 2. python3 _source/images.py           # auto-discovers it, no list to edit
# 3. reference it in a page, then commit BOTH the original and the variants
```

Output names are the filename slugified: `Tented Reception 2026.jpg` →
`tented-reception-2026-{640,1024,1600}.{webp,jpg}`.

## The build's warnings are load-bearing — read them

It *fails* on: a page referencing a missing asset (`srcset` candidates
included), duplicate page URLs, unresolved `{{placeholders}}`, an unknown `nav`
key, or a malformed `url`.

It *warns* on: a photo sitting in `orig/` with no generated variants, a
title/description outside Google's truncation limits, and links to pages that
don't exist yet.

Don't push past a warning without understanding it. Several were added
specifically because a real bug shipped past a silent failure.

## House rules learned the hard way

- **Components must work on both dark and light sections.** Styles are
  dark-first with `.section--paper` overrides. Getting this backwards renders
  near-black text on a near-black background — it happened, on three pages.
- **Check contrast when text sits over an image or video**, against the
  *brightest* pixel, not the average. The brand gold is close in luminance to
  several photo highlights.
- **Never invent facts about the band.** No venues, statistics, prices, dates,
  or testimonials that aren't already on the site or supplied by Ben. The
  `/services/` pages exist to win search traffic and must not read as
  near-duplicate doorway pages (measured overlap is currently ~11%).
- **US spelling** in all user-facing copy.
- The `/services/send-offs/` page is for funerals and is deliberately restrained
  — no exclamation marks, no urgency, no photo. Keep it that way.

## Depth

`README.md` documents everything above in full, plus design tokens with
measured contrast ratios, the header-banner gradient math, redirects, and the
per-page notes. Read it before any non-trivial change.

## Open questions for Ben

- Real instrumentation for the six band configurations (the old site left them blank)
- Confirmation of the booking step-3 wording about a written agreement
- A few sentences on Dances — thinnest of the six service pages
- Whether the old `/payment/` page is dead (it has no redirect yet)
