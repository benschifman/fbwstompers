#!/usr/bin/env python3
"""
Static build for fbwstompers.com. No dependencies.

    python3 build.py            build into dist/
    python3 build.py --serve    build, then serve dist/ on :8787

Source layout
    src/layout.html         page skeleton, {{placeholders}}
    src/partials/*.html     header, footer, lightbox
    src/schema/*.json       JSON-LD nodes; band.json is on every page
    src/pages/*.html        front matter + <main> content

A page file looks like:

    title: Weddings | Foggy Bottom Whomp-Stompers
    description: ...
    url: /services/weddings/
    nav: services
    schema: service-weddings
    ---
    <main id="main"> ... </main>

`url` decides the output path: /about/ -> dist/about/index.html, so URLs stay
clean without server rewrites.
"""

import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).parent
SRC = ROOT / "src"
DIST = ROOT / "dist"

SITE_URL = "https://fbwstompers.com"
ASSET_V = "13"         # bump to bust caches on deploy
COPY = ["assets", "data"]
SKIP_DIRS = {"orig"}   # untouched originals stay out of the deploy

# Old URL -> new URL, emitted as _redirects (Netlify / Cloudflare Pages format).
# Anything that exists on the live WordPress site but not here needs an entry,
# or its search ranking and any inbound links are thrown away on cutover.
REDIRECTS = [
    ("/booking/", "/contact/", 301),   # merged into contact
    ("/booking",  "/contact/", 301),
    ("/gigs/",    "/events/",  301),   # unlinked "gig tracker" page on the old site
]

DEFAULTS = {
    "og_type": "website",
    "og_image": "/assets/img/hero-dance-1600.jpg",
    "og_image_alt": "The Foggy Bottom Whomp-Stompers playing for a crowded dance floor.",
    "schema": "band",
    "lightbox": "no",
    "nav": "",
}


def parse_page(path: Path) -> tuple[dict, str]:
    raw = path.read_text()
    if "\n---\n" not in raw:
        raise SystemExit(f"{path}: missing '---' front-matter separator")
    front, body = raw.split("\n---\n", 1)

    meta = dict(DEFAULTS)
    for i, line in enumerate(front.splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if ":" not in line:
            raise SystemExit(f"{path}:{i}: expected 'key: value', got {line!r}")
        k, v = line.split(":", 1)
        meta[k.strip()] = v.strip()

    for required in ("title", "description", "url"):
        if required not in meta:
            raise SystemExit(f"{path}: missing required '{required}'")

    meta.setdefault("og_title", meta["title"])
    meta.setdefault("og_description", meta["description"])
    return meta, body.strip()


def check_seo(name: str, meta: dict) -> list[str]:
    """Soft limits. Google truncates titles near 60 characters and snippets
    near 160, so anything outside these ranges is cut off or wasting space."""
    notes = []
    t, d = len(meta["title"]), len(meta["description"])
    if t > 65:
        notes.append(f"{name}: title {t} chars — will truncate (aim <= 60)")
    elif t < 20:
        notes.append(f"{name}: title only {t} chars — wasting result space")
    if d > 165:
        notes.append(f"{name}: description {d} chars — will be cut (aim 120-160)")
    elif d < 70:
        notes.append(f"{name}: description only {d} chars — thin snippet")
    return notes


def load_schema(names: str) -> str:
    """Always emit band.json, plus any page-specific nodes, as one @graph."""
    nodes = []
    for name in [n.strip() for n in names.split(",") if n.strip()]:
        f = SRC / "schema" / f"{name}.json"
        if not f.exists():
            raise SystemExit(f"missing schema file: {f}")
        data = json.loads(f.read_text())
        nodes.extend(data if isinstance(data, list) else [data])

    if len(nodes) == 1:
        doc = {"@context": "https://schema.org", **nodes[0]}
    else:
        doc = {"@context": "https://schema.org", "@graph": nodes}
    return json.dumps(doc, indent=2, ensure_ascii=False)


def mark_current_nav(header: str, key: str) -> str:
    """Add aria-current to the link whose data-nav matches this page."""
    if not key:
        return header
    pattern = re.compile(r'(<a[^>]*data-nav="%s")' % re.escape(key))
    if not pattern.search(header):
        raise SystemExit(f"nav key {key!r} matches no link in header.html")
    return pattern.sub(r'\1 aria-current="page"', header, count=1)


def build() -> None:
    layout = (SRC / "layout.html").read_text()
    header_src = (SRC / "partials" / "header.html").read_text().strip()
    footer = (SRC / "partials" / "footer.html").read_text().strip()
    lightbox = (SRC / "partials" / "lightbox.html").read_text().strip()

    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir()

    pages = sorted(SRC.glob("pages/*.html"))
    if not pages:
        raise SystemExit("no pages found in src/pages/")

    seen_urls: dict[str, Path] = {}
    seo_notes: list[str] = []
    for page in pages:
        meta, body = parse_page(page)
        seo_notes.extend(check_seo(page.name, meta))

        url = meta["url"]
        if not url.startswith("/") or not url.endswith("/"):
            raise SystemExit(f"{page}: url must start and end with '/' (got {url!r})")
        if url in seen_urls:
            raise SystemExit(f"duplicate url {url!r}: {page} and {seen_urls[url]}")
        seen_urls[url] = page

        html = layout
        for key, value in {
            **meta,
            "site_url": SITE_URL,
            "asset_v": ASSET_V,
            "schema": load_schema(meta["schema"]),
            "header": mark_current_nav(header_src, meta["nav"]),
            "footer": footer,
            "body": body,
            "lightbox": lightbox if meta["lightbox"] == "yes" else "",
        }.items():
            html = html.replace("{{%s}}" % key, str(value))

        leftover = re.findall(r"\{\{(\w+)\}\}", html)
        if leftover:
            raise SystemExit(f"{page}: unresolved placeholders {sorted(set(leftover))}")

        out = DIST / url.strip("/") / "index.html" if url != "/" else DIST / "index.html"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(html)
        print(f"  {url:34} <- {page.name}")

    for name in COPY:
        src_dir = ROOT / name
        if not src_dir.exists():
            continue
        shutil.copytree(
            src_dir,
            DIST / name,
            ignore=lambda d, names: [n for n in names if n in SKIP_DIRS],
        )

    if seo_notes:
        print("\n  SEO notes:")
        for n in seo_notes:
            print(f"    {n}")

    check_unprocessed_images()
    check_links(seen_urls)
    write_sitemap(seen_urls)
    (DIST / "robots.txt").write_text(
        f"User-agent: *\nAllow: /\n\nSitemap: {SITE_URL}/sitemap.xml\n"
    )
    (DIST / "_redirects").write_text(
        "".join(f"{src}  {dst}  {code}\n" for src, dst, code in REDIRECTS)
    )

    total = sum(f.stat().st_size for f in DIST.rglob("*") if f.is_file())
    print(f"\n  {len(pages)} pages -> dist/  ({total/1024/1024:.1f} MB)")


def check_unprocessed_images() -> None:
    """Flag originals that have no generated variants.

    The likely mistake when adding a photo is dropping it into
    assets/img/orig/ and forgetting to run `python3 _source/images.py`. The
    original alone is useless — pages reference the generated sizes — so the
    photo would simply never appear. Nothing else catches this, because the
    page markup that would reference it hasn't been written yet either.
    """
    orig = ROOT / "assets" / "img" / "orig"
    out = ROOT / "assets" / "img"
    if not orig.is_dir():
        return

    # Mirrors SKIP in _source/images.py — originals deliberately left raw.
    skip = {"cropped-android-chrome-512x512-1-1-192x192.png"}
    exts = {".jpg", ".jpeg", ".png", ".webp"}

    generated = {f.name for f in out.glob("*-*.webp")}
    unprocessed = []
    for f in sorted(orig.iterdir()):
        if f.name.startswith(".") or f.name in skip or f.suffix.lower() not in exts:
            continue
        # An original is "processed" if any file named <something>-<width>.webp
        # exists whose stem could plausibly derive from it. Cheapest reliable
        # signal: at least one generated file shares the slugified stem, OR the
        # original is listed in the rename table used by the image script.
        slug = re.sub(r"[^a-z0-9]+", "-", f.stem.lower()).strip("-")
        if any(g.startswith(slug + "-") for g in generated):
            continue
        if _is_renamed_original(f.name):
            continue
        unprocessed.append(f.name)

    if unprocessed:
        print("\n  Photos added but not processed yet:")
        for name in unprocessed:
            print(f"    {name}")
        print("    -> run: python3 _source/images.py")


def _is_renamed_original(filename: str) -> bool:
    """True if _source/images.py maps this original to a different output name."""
    script = ROOT / "_source" / "images.py"
    if not script.exists():
        return False
    return f"'{filename}'" in script.read_text()


def check_links(page_urls: dict) -> None:
    """Fail the build on a broken internal reference.

    Catches the easy, invisible mistakes: an <img> pointing at a filename that
    was never generated, or an internal link to a page that doesn't exist yet.
    Both render as a silently broken page rather than an error, so they're
    exactly what a build should be checking.
    """
    missing_assets: dict[str, set] = {}
    missing_links: dict[str, set] = {}

    asset_re = re.compile(r'(?:src|href)="(/assets/[^"\s]+?)"|srcset="([^"]+)"')
    link_re = re.compile(r'href="(/[^"#?]*?)"')

    for html_file in DIST.rglob("index.html"):
        page = "/" + str(html_file.parent.relative_to(DIST)).replace(".", "").strip("/")
        page = page if page.endswith("/") else page + "/"
        text = html_file.read_text()

        refs = set()
        for direct, srcset in asset_re.findall(text):
            if direct:
                refs.add(direct.split("?")[0])
            for candidate in srcset.split(","):
                candidate = candidate.strip().split(" ")[0]
                if candidate.startswith("/assets/"):
                    refs.add(candidate.split("?")[0])
        for ref in refs:
            if not (DIST / ref.lstrip("/")).exists():
                missing_assets.setdefault(page, set()).add(ref)

        for href in link_re.findall(text):
            if href.startswith("/assets/") or href.startswith("/data/"):
                continue
            href = href if href.endswith("/") else href + "/"
            if href not in page_urls:
                missing_links.setdefault(page, set()).add(href)

    if missing_assets:
        print("\n  BUILD FAILED — missing asset files:")
        for page, refs in sorted(missing_assets.items()):
            for ref in sorted(refs):
                print(f"    {page:28} -> {ref}")
        raise SystemExit(1)

    if missing_links:
        print("\n  Warning — links to pages that don't exist yet:")
        for page, refs in sorted(missing_links.items()):
            for ref in sorted(refs):
                print(f"    {page:28} -> {ref}")


def write_sitemap(urls: dict) -> None:
    entries = "\n".join(
        f"  <url><loc>{SITE_URL}{u}</loc></url>" for u in sorted(urls)
    )
    (DIST / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{entries}\n</urlset>\n"
    )


if __name__ == "__main__":
    build()
    if "--serve" in sys.argv:
        import http.server, functools, socketserver
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(DIST))
        with socketserver.TCPServer(("127.0.0.1", 8787), handler) as httpd:
            print("\n  serving dist/ at http://127.0.0.1:8787/  (ctrl-c to stop)")
            httpd.serve_forever()
