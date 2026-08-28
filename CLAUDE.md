# fbwstompers.com

Static site for a working Washington, DC jazz band. Plain HTML/CSS, a small
Python build script, no framework and no dependencies.

## ⚠️ Pushing to `main` publishes to the live public website

`git push` → Cloudflare rebuilds and deploys → **https://fbwstompers.com is
updated within a minute or two.** There is no staging step and no preview
gate. This is a real business's site that real clients use to book the band.

Treat every push as a publish. Build and check locally first; don't push
speculative or half-finished work.

`wrangler.jsonc` is the only part of the deploy wiring visible in this repo.
The git integration and the build command live in the Cloudflare dashboard.

## Where the site actually lives (set up Aug 9, 2026)

Migrated off WordPress on SiteGround. The pieces, and who owns each:

| Thing | Where | Notes |
| --- | --- | --- |
| Domain registrar | Namecheap | nameservers point at Cloudflare |
| Nameservers | `tara`/`hank.ns.cloudflare.com` | changed at Namecheap, Aug 9 |
| DNS | Cloudflare | zone `fbwstompers.com`, free plan |
| Hosting | **Cloudflare Workers**, project `fbwstompers` | *not* Pages — see below |
| Repo | `git@github.com:benschifman/fbwstompers.git` | SSH auth, push to `main` deploys |
| Direct URL | `fbwstompers.fbwstompers.workers.dev` | bypasses DNS; useful for testing |

**It's a Workers project, not Pages.** The current Cloudflare dashboard defaults
new projects to unified Workers, so the deploy runs `npx wrangler deploy` rather
than the Pages build pipeline. Functionally equivalent for a static site, but it
changes three things worth knowing:

- `wrangler.jsonc` is **required** — it sets `assets.directory` to `dist`.
  Without it the deploy fails with "Could not detect a directory containing
  static files." Two builds failed this way before it was added.
- The build command (`python3 build.py`) is set in the dashboard under
  Settings → Build, *separately* from the deploy command. If only the deploy
  command is set, `wrangler deploy` runs with no `dist/` to publish and fails.
- `_redirects` **does** work here — verified live, `/booking/` and `/gigs/`
  both 301 correctly. The README calls the file "Netlify / Cloudflare Pages
  format"; Workers static assets honors it too.

**The custom domains are bound at the Worker, not as A records.** In the DNS
table `fbwstompers.com` and `www` show as type `Worker` with a padlock. Adding
them required deleting the old SiteGround A records first — Cloudflare refuses
with "Hostname already has externally managed DNS records" otherwise.

### Verifying a deploy — don't trust the browser

After the domain cut over, `fbwstompers.com` served the *old* WordPress site in
the browser for a while, while the deploy was actually fine. It was stale DNS
cached locally and at the ISP. Check with a cache-bypassing request instead:

```bash
curl -sI --resolve fbwstompers.com:443:104.21.94.107 https://fbwstompers.com/
```

`server: cloudflare` means the new site. `server: nginx` plus `x-httpd` or
`wp-json` headers means you're still seeing SiteGround. A phone on cellular is
the fastest human check.

## Email

Receiving runs on **Cloudflare Email Routing** (free) — no mailbox, it forwards
to the band's existing Gmail. Sending is Gmail's "Send mail as". Chosen over
paid hosting because Contact/Booking both intake through an embedded Google
Form, so email carries very little load.

DNS records for this are Cloudflare-managed (padlocked): MX to
`route1/2/3.mx.cloudflare.net` and DKIM at `cf2024-1._domainkey`. The SPF record
is hand-edited — see the block below, it needs Google added. Enabling Email
Routing does **not** remove the old provider's records: the three SiteGround
`mx*.antispam.mailspamprotection.com` MX records and the old SPF had to be
deleted by hand, or the two sets compete.

Known limitation: sending through Gmail's servers on a non-Gmail domain means
headers show the Gmail origin and some recipients see "via gmail.com". Fine at
this volume; it does rule out a strict DMARC policy later without moving to a
real mailbox (~$12/yr, Zoho Mail Lite or Namecheap Private Email).

### The send-as trap — cost an hour on Aug 9

`hello@fbwstompers.com` **has no mailbox and no SMTP server.** Email Routing
only receives. Sending works by relaying through Gmail's own SMTP:

| Field | Value |
| --- | --- |
| SMTP server | `smtp.gmail.com`, port `587`, **TLS** |
| Username | the band's **Gmail** address — *not* `hello@fbwstompers.com` |
| Password | a Google **app password**, not the account password |

The app password needs 2-Step Verification enabled; the normal account password
returns "Authentication error" because Google blocks it for external SMTP.

What broke: Gmail's send-as had been carried over from the WordPress era, still
pointed at SMTP server `fbwstompers.com:465`. That worked when the apex resolved
to the SiteGround box running a real mailbox. After the migration the apex points
at the Worker, and Cloudflare's proxy refuses SMTP — so Gmail could not connect
and **every send failed silently**. Gmail's Sent folder showed the message, no
bounce ever arrived, and nothing reached the recipient. It looked like a spam
filter for a while; it wasn't.

Diagnosing this class of failure: mail that reaches *nobody* (not even
`mail-tester.com`) is a sending failure, not a filtering problem. Filtering
looks like mail arriving for some recipients and not others.

SPF must authorize both services, in one record, or Gmail-relayed mail is
unauthenticated:

```
v=spf1 include:_spf.mx.cloudflare.net include:_spf.google.com ~all
```

Cloudflare's own setup only adds the first include. Keep DMARC at `p=none` —
free Gmail signs DKIM as `gmail.com`, so mail from this domain can never align,
and a stricter policy would reject the band's own mail.

## SiteGround is gone (deactivated Aug 9, 2026)

Cancelled rather than renewed — saves $215.88/yr. Its mailboxes were checked
first and held nothing worth keeping, so nothing was exported.

`mail`, `autoconfig`, and `autodiscover` were deleted from DNS with it. **`ftp`
and `ssh` are still in the zone**, still pointing at the decommissioned box
`35.215.87.106`; nothing references them and they can go whenever. That is also
what keeps Cloudflare's "origin IP partially exposed" recommendation showing —
expected, not a problem to fix.

Deleting `mail` mattered more than it looks. The box stayed up and kept
answering SMTP on ports 25/465/587 after deactivation, so a mail client that
auto-discovered it would try to authenticate against a server the band no
longer controls.

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
- Whether the old `/payment/` page is dead (it has no redirect yet, and currently
  404s in production — confirmed live)

### Loose ends from the Aug 9 session

- **No WordPress backup was ever taken.** SiteGround is now deactivated, so the
  window has closed. `_source/` holds the scrape of the public pages, which is
  all that survives — no database, no theme, no plugin config.
- `ftp` and `ssh` DNS records still point at the dead SiteGround box.
- A stale `_domainkey` TXT (`"v=DKIM1; o=~"`) is still in the zone. Harmless —
  different selector from Cloudflare's `cf2024-1._domainkey` — but it is noise.
- `_source/` — the raw WordPress scrape, including `roof-home.html` full of
  Elementor markup — is committed. It alarmed Ben on sight; worth knowing it is
  inert reference data that `build.py` never reads (zero references, verified).
  Offered to strip it from the repo; he left it in. Still fair game to remove.
- Idea discussed, not built: an **A/B audio player** on the Configurations page
  letting visitors compare lineups (tuba vs. string bass, banjo vs. guitar).
  Hosting cost is a non-issue — ~12 short MP3s is smaller than the image library,
  and Cloudflare's terms only bite on bulk video. The hard parts are recording
  discipline, not infrastructure: same tune, same take, same room, one variable
  changed; loudness-normalize every clip to the same LUFS or the louder one just
  sounds "better"; `preload="none"` so audio doesn't download for people who
  never press play. If it ever grows past a few GB, move the files to R2.
