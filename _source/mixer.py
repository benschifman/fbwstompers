"""Prepare the media for the band mixer on /about/configurations/.

    python3 _source/mixer.py

Needs ffmpeg on PATH (audio) and Pillow (overlays). Re-running on unchanged
sources reproduces the same files.

AUDIO — assets/audio/orig/*.mp3 -> assets/audio/<name>.mp3

Every mix is loudness-matched to TARGET_LUFS and re-encoded at 128 kbps. The
matching is the point, not a nicety: without it the mix with more players is
simply louder, and louder reads as "better", so the comparison would be rigged.
Gain is a single fixed amount per file (no compression), so the dynamics of
each take are untouched. Every mix must be the same take, same length, so the
player can switch between them mid-song without losing its place.

OVERLAYS — assets/img/mixer/orig/<player>-off.* -> assets/img/mixer/<player>-off.webp

Each source is the full band illustration (assets/img/orig/band-mixer.*) with
one player blacked out, and nothing else changed. The script keeps only the
pixels that differ from the base, feathers the edge, and crops to them, so each
player's "off" state is a small transparent patch laid over the one base image.
That way players toggle independently: no image per combination.

It prints the <img> line for each overlay, with its position as percentages
of the base image, ready to paste into src/pages/configurations.html.
"""

from PIL import Image, ImageChops, ImageFilter
import os, re, subprocess, sys

AUDIO_SRC = 'assets/audio/orig'
AUDIO_OUT = 'assets/audio'
TARGET_LUFS = -18.0
BITRATE = '128k'

BASE = 'assets/img/orig/band-mixer.webp'
OVERLAY_SRC = 'assets/img/mixer/orig'
OVERLAY_OUT = 'assets/img/mixer'
DIFF_THRESHOLD = 30   # per-pixel difference that counts as "changed" (0-255);
                      # below this is just compression noise between the two


def slugify(stem: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', stem.lower()).strip('-')


def loudness(path: str) -> float:
    out = subprocess.run(
        ['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af', 'ebur128', '-f', 'null', '-'],
        capture_output=True, text=True,
    ).stderr
    summary = out[out.rindex('Summary:'):]
    return float(re.search(r'I:\s+(-?[\d.]+) LUFS', summary).group(1))


def audio():
    if not os.path.isdir(AUDIO_SRC):
        return
    for fn in sorted(os.listdir(AUDIO_SRC)):
        stem, ext = os.path.splitext(fn)
        if fn.startswith('.') or ext.lower() not in {'.mp3', '.wav', '.flac', '.m4a', '.aif', '.aiff'}:
            continue
        src = os.path.join(AUDIO_SRC, fn)
        out = os.path.join(AUDIO_OUT, slugify(stem) + '.mp3')
        lufs = loudness(src)
        gain = TARGET_LUFS - lufs
        subprocess.run(
            ['ffmpeg', '-v', 'error', '-y', '-i', src,
             '-af', f'volume={gain:.2f}dB',
             '-map_metadata', '-1', '-c:a', 'libmp3lame', '-b:a', BITRATE,
             '-fflags', '+bitexact', '-flags:a', '+bitexact', out],
            check=True,
        )
        print(f'{out:52} {lufs:6.1f} LUFS {gain:+5.1f} dB  {os.path.getsize(out)/1e6:.1f} MB')


def overlays():
    if not os.path.isdir(OVERLAY_SRC):
        return
    base = Image.open(BASE).convert('RGB')
    W, H = base.size
    for fn in sorted(os.listdir(OVERLAY_SRC)):
        stem, ext = os.path.splitext(fn)
        if fn.startswith('.') or ext.lower() not in {'.png', '.jpg', '.jpeg', '.webp'}:
            continue
        off = Image.open(os.path.join(OVERLAY_SRC, fn)).convert('RGB')
        if off.size != base.size:
            raise SystemExit(f'{fn} is {off.size}, base is {base.size} — they must match exactly')

        diff = ImageChops.difference(base, off).convert('L')
        mask = diff.point(lambda v: 255 if v > DIFF_THRESHOLD else 0)
        # Open (drop isolated noise pixels), then grow and soften the edge so
        # the patch blends into the base rather than showing a hard outline.
        mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
        mask = mask.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(3))
        box = mask.getbbox()
        if not box:
            raise SystemExit(f'{fn}: no difference from the base image')

        patch = off.crop(box).convert('RGBA')
        patch.putalpha(mask.crop(box))
        name = slugify(stem)
        out = os.path.join(OVERLAY_OUT, name + '.webp')
        patch.save(out, quality=80, method=6)

        x, y, w, h = box[0], box[1], box[2] - box[0], box[3] - box[1]
        pct = lambda v, total: f'{100 * v / total:.2f}%'
        print(f'{out}  {w}x{h}  {os.path.getsize(out)/1e3:.0f} KB')
        print(f'  <img class="mixer__off" src="/{out}" alt="" width="{w}" height="{h}" '
              f'style="left:{pct(x, W)};top:{pct(y, H)};width:{pct(w, W)}">')


if __name__ == '__main__':
    os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
    if '--images' not in sys.argv[1:]:
        audio()
    if '--audio' not in sys.argv[1:]:
        overlays()
