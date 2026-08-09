"""Generate responsive image variants.

    python3 _source/images.py

TO ADD A PHOTO: drop it in assets/img/orig/ and run this script. That's it —
there is no list to update. Every image in orig/ is picked up automatically and
its output name comes from its filename, so `tented-reception.jpg` becomes
`tented-reception-640.webp`, `-1024.webp`, and so on.

The tables below are only overrides for the handful of legacy files whose
original names were unusable (`IMG_5036-scaled.jpg`) or that need special
treatment. New photos normally need no entry anywhere.
"""

from PIL import Image, ImageOps
import os, re, json

SRC = 'assets/img/orig'
OUT = 'assets/img'
WIDTHS = [640, 1024, 1600]
EXTS = {'.jpg', '.jpeg', '.png', '.webp'}

# Originals that must NOT go through the pipeline.
SKIP = {
    # Source for assets/img/favicon-192.png, which is placed by hand at its
    # exact final size — resizing it would be meaningless.
    'cropped-android-chrome-512x512-1-1-192x192.png',
}

# Sources that need a rotation before entering the normal pipeline.
# Positive = counter-clockwise (PIL convention), matches Image.rotate().
ROTATE = {
    'pexels-floral-12787690.jpg': -90,  # portrait book-cover scan -> landscape banner
}

# Some outputs (decorative CSS backgrounds, not <picture>) want a wider max
# width than the standard 1600 and don't need a 640 step.
CUSTOM_WIDTHS = {
    'page-head-bg': [900, 1800],
}

# Entries here get webp only, no jpg fallback. CSS background-image (unlike
# <picture>) has no simple markup-level fallback mechanism, so a fallback
# means real effort (image-set(), or a second rule wrapped in @supports). Not
# worth it for pure ornament: webp support is ~98% of browsers (Safari since
# 14, 2020), matching the baseline the rest of the site already assumes
# (native <dialog>, backdrop-filter). Skipping the jpg keeps ~330KB of dead
# weight out of dist/ instead of shipping files nothing links to.
WEBP_ONLY = {'page-head-bg'}

# Overrides only, for originals whose own filename makes a poor output name.
# A new photo does NOT need an entry here — see the module docstring.
RENAME = {
    # real performance photos
    'IMG_5036-scaled.jpg':                       'hero-dance',      # packed indoor dance floor
    'IMG_5252-scaled.jpg':                       'party-rooftop',   # rooftop party
    'tweed_ride_mid-point_IMG_3942-scaled.jpg':  'dance-outdoor',   # outdoor, Tweed Ride
    'fbws-wedding.jpg':                          'wedding',         # tented wedding at dusk
    'a4afd58b0ce35183060ad4cc60c70059-e1562449883211.jpg': 'band-portrait',

    # band configuration diagrams
    'core.jpg':                                  'config-core',
    'more.jpg':                                  'config-full',

    # poster frame for the CTA background video (YouTube lxGdBM3V0fw)
    'yt-maxresdefault.jpg':                      'cta-poster',

    # period sheet-music covers (repertoire page)
    '10da7763d02ae307933253f30220dffc.jpg':      'sheet-dreams',
    'f0134747ed04d776513a56f86df1bef7.jpg':      'sheet-blackbird',

    # decorative banner behind interior-page headers (CSS background, not <img>)
    'pexels-floral-12787690.jpg':                'page-head-bg',
}

def slugify(stem: str) -> str:
    """Filename stem -> safe output name. 'Tented Reception (2).JPG' -> 'tented-reception-2'."""
    s = re.sub(r'[^a-z0-9]+', '-', stem.lower()).strip('-')
    return s or 'image'


def discover():
    """Every original in orig/, paired with the name its variants will use."""
    for fn in sorted(os.listdir(SRC)):
        if fn.startswith('.') or fn in SKIP:
            continue
        stem, ext = os.path.splitext(fn)
        if ext.lower() not in EXTS:
            continue
        yield fn, RENAME.get(fn, slugify(stem))


manifest = {}
seen_names: dict[str, str] = {}
for fn, name in discover():
    # Two originals resolving to the same output name would silently overwrite
    # each other's variants, so fail loudly instead.
    if name in seen_names:
        raise SystemExit(
            f"name collision: '{fn}' and '{seen_names[name]}' both produce '{name}'.\n"
            f"Rename one of the files in {SRC}/, or add a RENAME override."
        )
    seen_names[name] = fn

    p = os.path.join(SRC, fn)
    im = ImageOps.exif_transpose(Image.open(p)).convert('RGB')
    if fn in ROTATE:
        im = im.rotate(ROTATE[fn], expand=True)
    w0, h0 = im.size
    widths = CUSTOM_WIDTHS.get(name, WIDTHS)
    entry = {'src': fn, 'w': w0, 'h': h0, 'sizes': []}
    for w in widths:
        if w > w0 and w != widths[0]:
            continue
        h = round(h0 * w / w0)
        r = im.resize((w, h), Image.LANCZOS)
        # Decorative CSS backgrounds sit mostly under an opaque gradient, so
        # they can take a bigger quality hit than photos people look at directly.
        if name in CUSTOM_WIDTHS:
            q = 38 if w >= 1600 else 48
        else:
            q = 68 if w >= 1024 else 78
        r.save(f'{OUT}/{name}-{w}.webp', quality=q, method=6)
        if name not in WEBP_ONLY:
            r.save(f'{OUT}/{name}-{w}.jpg', quality=q, optimize=True, progressive=True)
        entry['sizes'].append(w)
    manifest[name] = entry
    print(f'{name:16} {w0}x{h0} -> {entry["sizes"]}')

json.dump(manifest, open('_source/images.json', 'w'), indent=2)
