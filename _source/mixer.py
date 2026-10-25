"""Prepare the media for the band mixer on /about/configurations/.

    python3 _source/mixer.py

Needs ffmpeg on PATH (audio) and Pillow (overlays). Re-running on unchanged
sources reproduces the same files.

AUDIO — assets/audio/stems/orig/<track>.mp3
        -> assets/audio/stems/{full,excerpt}/<track>.mp3 + mix.json

One file per instrument track, all from the same session export: same start,
same length. The browser downloads every track and mixes them live, so any
lineup plays in perfect sync. That means every track has to sit decoded in
memory at once, so each track is made in two VARIANTS: the full song for
desktops (~400 MB decoded, ~25 MB to download) and a short excerpt for phones
and tablets (75 s: ~110 MB decoded, ~7.5 MB), which would crash on the full
song. main.js picks one per visitor. Every track except STEREO ones is folded
to mono, which halves both numbers.

The tracks' relative levels are left exactly as exported — never matched per
track, or the band's balance is gone. Each variant's mix.json carries one
master gain that puts the whole band, all tracks summed, at a -1 dBFS peak,
plus the length and a waveform outline per track for the page to draw.

OVERLAYS — assets/img/mixer/orig/<player>-off.* -> assets/img/mixer/<player>-off.webp

Each source is the full band illustration (assets/img/orig/band-mixer.png) with
one player grayed out, and nothing else changed. The script keeps only the
pixels that differ from the base and crops to them, so each
player's "off" state is a small transparent patch laid over the one base image.
That way players toggle independently: no image per combination.

It prints the <img> line for each overlay, with its position as percentages
of the base image, ready to paste into src/pages/configurations.html.
"""

from PIL import Image, ImageChops
import os, re, subprocess, sys

AUDIO_SRC = 'assets/audio/stems/orig'
AUDIO_OUT = 'assets/audio/stems'
# name: (start, length or None for all of it, fade-out at the end), in seconds
VARIANTS = {
    'full': (0.0, None, 0.0),
    'excerpt': (0.0, 75.0, 2.5),
}
STEREO = {'piano', 'drums'}   # genuinely wide; the rest are (near-)mono
BITRATE = {1: '96k', 2: '160k'}
PEAK_TARGET_DB = -1.0
WAVE_BINS = 480         # waveform resolution; the page scales it to fit

BASE = 'assets/img/orig/band-mixer.png'
OVERLAY_SRC = 'assets/img/mixer/orig'
OVERLAY_OUT = 'assets/img/mixer'
DIFF_THRESHOLD = 0    # per-pixel difference that counts as "changed" (0-255).
                      # The Photopea exports are lossless and identical outside
                      # the grayed player, so any difference at all is real.


def slugify(stem: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', stem.lower()).strip('-')


def decode(path: str, channels: int = 2) -> 'numpy.ndarray':
    import numpy as np
    raw = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', path, '-ac', str(channels), '-ar', '44100', '-f', 'f32le', '-'],
        capture_output=True, check=True,
    ).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, channels)


def audio():
    if not os.path.isdir(AUDIO_SRC):
        return
    for variant, cut in VARIANTS.items():
        render_variant(variant, *cut)


def render_variant(variant, start, length, fade):
    import json
    import numpy as np
    out_dir = os.path.join(AUDIO_OUT, variant)
    os.makedirs(out_dir, exist_ok=True)
    tracks = {}
    for fn in sorted(os.listdir(AUDIO_SRC)):
        stem, ext = os.path.splitext(fn)
        if fn.startswith('.') or ext.lower() not in {'.mp3', '.wav', '.flac', '.m4a', '.aif', '.aiff'}:
            continue
        name = slugify(stem)
        src = os.path.join(AUDIO_SRC, fn)
        out = os.path.join(out_dir, name + '.mp3')
        ch = 2 if name in STEREO else 1
        cut = ['-ss', str(start)] + (['-t', str(length)] if length else [])
        filters = ['-af', f'afade=t=out:st={length - fade}:d={fade}'] if length and fade else []
        subprocess.run(
            ['ffmpeg', '-v', 'error', '-y', *cut, '-i', src, *filters, '-ac', str(ch),
             '-map_metadata', '-1', '-c:a', 'libmp3lame', '-b:a', BITRATE[ch],
             '-fflags', '+bitexact', '-flags:a', '+bitexact', out],
            check=True,
        )
        # Measure what the browser will actually play: the encoded output.
        tracks[name] = decode(out, ch)
        print(f'{out:48} {"stereo" if ch == 2 else "mono  "}  {os.path.getsize(out)/1e6:5.2f} MB')

    if not tracks:
        return
    n = min(len(t) for t in tracks.values())
    band = np.zeros((n, 2), np.float32)
    for t in tracks.values():
        band += t[:n]          # a mono track plays equally in both speakers
    peak_db = 20 * np.log10(np.abs(band).max())
    gain_db = round(float(PEAK_TARGET_DB - peak_db), 2)

    waves = {}
    for name, t in tracks.items():
        mono = np.abs(t[:n]).max(axis=1)
        edges = np.linspace(0, n, WAVE_BINS + 1).astype(int)
        # 0-100, on one scale for every track, so a quiet part looks quiet.
        waves[name] = [int(round(100 * mono[a:b].max())) for a, b in zip(edges, edges[1:])]
    doc = {'duration': round(n / 44100, 3), 'gainDb': gain_db, 'waves': waves}
    with open(os.path.join(out_dir, 'mix.json'), 'w') as f:
        json.dump(doc, f, separators=(',', ':'))
    print(f'{variant}/mix.json  {doc["duration"]} s, whole band peaks at {peak_db:+.1f} dBFS'
          f' -> master {gain_db:+.1f} dB\n')


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
        # No feathering: the patch carries exactly the pixels the export
        # changed, so one patch over the base reproduces that export exactly.
        # (Grow or blur it and the edge drags in neighbors' full-color pixels,
        # which show as a halo where two grayed players overlap.)
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
