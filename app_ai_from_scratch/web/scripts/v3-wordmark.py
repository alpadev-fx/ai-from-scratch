#!/usr/bin/env python3
"""The /v3 footer wordmark: «AI FROM SCRATCH» as precomputed SVG paths (src/aegis/wordmark.ts).

The page never draws this text with a font: it ships the outlines of the glyphs, cut once from an OFL font (never SF Pro, whose licence does not allow it),
so the footer's moving lines can run along the real edges of the letters and nothing depends on a font loading. Two layouts share one path language:
  one  the whole name on one line (desktop)
  two  «AI FROM» over «SCRATCH» (phones), both lines flush left, the shorter one scaled up to the width of the longer, so the block is a rectangle.

    uv run --with fonttools==4.66.1 --with uharfbuzz==0.56.2 python3 web/scripts/v3-wordmark.py            # write src/aegis/wordmark.ts
    uv run --with fonttools==4.66.1 --with uharfbuzz==0.56.2 python3 web/scripts/v3-wordmark.py --check    # exit 1 if the committed file differs from what the font gives
    ... --font /path/to/Geist-Bold.ttf                                                                    # a local copy of the SAME file (its sha256 is checked all the same)

Fail closed: a font whose sha256 is not the pinned one is an error, never a different-looking wordmark. The output is deterministic (integers only).
"""
import hashlib
import io
import math
import os
import sys
import tempfile
import urllib.request

# ---------- the font: pinned by commit and by sha256 ----------
FONT = dict(
    name='Geist Bold',
    family='Geist',
    version='1.5.1',
    source='https://github.com/vercel/geist-font',
    commit='3c80bfcc1ba4988ece0eda46a282e15d29e61bbf',
    path='fonts/Geist/ttf/Geist-Bold.ttf',
    sha256='b807d67c1e8712b800c757edb23ff49d9c6a1d9c8347da171fee61db56ee2910',
    license='SIL Open Font License 1.1',
    copyright='Copyright 2024 The Geist Project Authors (https://github.com/vercel/geist-font.git)',
    licenseUrl='https://openfontlicense.org',
)
FONT_URL = f"https://raw.githubusercontent.com/vercel/geist-font/{FONT['commit']}/{FONT['path']}"

# ---------- the wordmark ----------
TEXT = 'AI FROM SCRATCH'
LINES = ('AI FROM', 'SCRATCH')
UPM = 500            # output units per em: integers only, a unit is 0.3 px on a 1440 screen
SPACE_EM = 0.22      # the word space (the font's own is wider than a wordmark wants)
TRACK_EM = 0.0       # extra space between letters, on top of the font's kerning
LEAD_CAP = 0.30      # the gap between the two lines, in cap heights

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '..', 'src', 'aegis', 'wordmark.ts'))


def die(msg):
    print(f'v3-wordmark: {msg}', file=sys.stderr)
    sys.exit(1)


def load_font_bytes(local):
    """The pinned font's bytes. A local file is accepted only if it is the very same file (sha256)."""
    if local:
        data = open(local, 'rb').read()
    else:
        cache = os.path.join(tempfile.gettempdir(), f"v3-wordmark-{FONT['sha256'][:12]}.ttf")
        if os.path.exists(cache):
            data = open(cache, 'rb').read()
        else:
            try:
                with urllib.request.urlopen(FONT_URL, timeout=60) as r:
                    data = r.read()
            except Exception as e:  # noqa: BLE001 - any network failure is the same failure
                die(f'cannot download {FONT_URL}: {e}')
            if hashlib.sha256(data).hexdigest() == FONT['sha256']:
                open(cache, 'wb').write(data)
    got = hashlib.sha256(data).hexdigest()
    if got != FONT['sha256']:
        die(f"the font is not the pinned one: sha256 {got}, expected {FONT['sha256']} ({FONT_URL})")
    return data


def build(font_bytes):
    from fontTools.pens.basePen import BasePen
    from fontTools.ttLib import TTFont
    import uharfbuzz as hb

    ttf = TTFont(io.BytesIO(font_bytes))
    glyphs = ttf.getGlyphSet()
    order = ttf.getGlyphOrder()
    upem = ttf['head'].unitsPerEm
    cap_font = ttf['OS/2'].sCapHeight
    face = hb.Face(font_bytes)
    hbfont = hb.Font(face)
    s0 = UPM / upem

    class Pen(BasePen):
        """Contours in font units, y up: [('M', p), ('L', p), ('Q', c, p)...]."""
        def __init__(self, gs):
            super().__init__(gs)
            self.contours, self.cur = [], None

        def _moveTo(self, p): self.cur = [('M', p)]
        def _lineTo(self, p): self.cur.append(('L', p))
        def _qCurveToOne(self, c, p): self.cur.append(('Q', c, p))
        def _curveToOne(self, c1, c2, p): self.cur.append(('C', c1, c2, p))
        def _closePath(self): self.contours.append(self.cur); self.cur = None
        def _endPath(self): self.contours.append(self.cur); self.cur = None

    def line(text):
        """One line, laid out at UPM units per em: (contours in output units y up, advance width, and the pen's x of each glyph)."""
        for ch in text:
            if ch != ' ' and ord(ch) not in ttf.getBestCmap():
                die(f'the font has no glyph for {ch!r}')
        b = hb.Buffer()
        b.add_str(text)
        b.guess_segment_properties()
        hb.shape(hbfont, b, {'kern': True, 'liga': False, 'calt': False})
        x, out = 0.0, []
        for i, (info, pos) in enumerate(zip(b.glyph_infos, b.glyph_positions)):
            ch = text[info.cluster]
            adv = SPACE_EM * upem if ch == ' ' else pos.x_advance
            if ch != ' ':
                pen = Pen(glyphs)
                glyphs[order[info.codepoint]].draw(pen)
                for c in pen.contours:
                    out.append([(seg[0],) + tuple(((x + pos.x_offset + px) * s0, (py + pos.y_offset) * s0) for px, py in seg[1:]) for seg in c])
            x += adv + (TRACK_EM * upem if i < len(b.glyph_infos) - 1 else 0)
        return out, x * s0

    def flat(contour, n=24):
        """A contour as a polyline (for bounds and lengths): every curve cut into n pieces."""
        pts = [contour[0][1]]
        for seg in contour[1:]:
            a = pts[-1]
            if seg[0] == 'L':
                pts.append(seg[1])
            elif seg[0] == 'Q':
                c, p = seg[1], seg[2]
                for k in range(1, n + 1):
                    t = k / n
                    pts.append(((1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t * t * p[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t * t * p[1]))
            else:
                c1, c2, p = seg[1], seg[2], seg[3]
                for k in range(1, n + 1):
                    t = k / n
                    pts.append(((1 - t) ** 3 * a[0] + 3 * (1 - t) ** 2 * t * c1[0] + 3 * (1 - t) * t * t * c2[0] + t ** 3 * p[0],
                                (1 - t) ** 3 * a[1] + 3 * (1 - t) ** 2 * t * c1[1] + 3 * (1 - t) * t * t * c2[1] + t ** 3 * p[1]))
        return pts

    def bounds(contours):
        pts = [p for c in contours for p in flat(c)]
        return min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts)

    def place(contours, sx, sy, dx, dy):
        """Scale (about the origin) then move; y flips here: the output is y down."""
        return [[(seg[0],) + tuple((px * sx + dx, -(py * sy) + dy) for px, py in seg[1:]) for seg in c] for c in contours]

    def serialize(contours):
        """Integers, relative commands, no separators where a sign is one: ~35 % shorter than the absolute form, and exact (each point is rounded once, then differenced)."""
        out, cmds = [], []
        for c in contours:
            q = [(seg[0],) + tuple((round(px), round(py)) for px, py in seg[1:]) for seg in c]
            cx, cy = q[0][1]
            cmds.append(('M', [cx, cy]))
            for seg in q[1:]:
                if seg[0] == 'L':
                    (x, y) = seg[1]
                    if y == cy and x != cx: cmds.append(('h', [x - cx]))
                    elif x == cx and y != cy: cmds.append(('v', [y - cy]))
                    elif (x, y) != (cx, cy): cmds.append(('l', [x - cx, y - cy]))
                    cx, cy = x, y
                elif seg[0] == 'Q':
                    (x1, y1), (x, y) = seg[1], seg[2]
                    cmds.append(('q', [x1 - cx, y1 - cy, x - cx, y - cy]))
                    cx, cy = x, y
                else:
                    (x1, y1), (x2, y2), (x, y) = seg[1], seg[2], seg[3]
                    cmds.append(('c', [x1 - cx, y1 - cy, x2 - cx, y2 - cy, x - cx, y - cy]))
                    cx, cy = x, y
            cmds.append(('z', []))
        prev = None
        for cmd, args in cmds:
            body = ''
            for a in args:
                t = str(a)
                body += t if (not body or t.startswith('-')) else ' ' + t
            if cmd == prev and cmd in 'hvlqc':                          # the same command again: its letter is implied
                out.append(body if body.startswith('-') else ' ' + body)
            else:
                out.append(cmd + body)
            prev = cmd
        return ''.join(out)

    def measure(contours):
        """The length of each contour, in output units and in the order of the path (the footer's runners are sized and timed by them)."""
        lens = []
        for c in contours:
            p = flat([(seg[0],) + tuple((round(px), round(py)) for px, py in seg[1:]) for seg in c], 64)
            lens.append(round(sum(math.dist(p[i], p[(i + 1) % len(p)]) for i in range(len(p)))))
        return lens

    cap = round(cap_font * s0)

    # one line
    c1, _ = line(TEXT)
    x0, y0, x1, y1 = bounds(c1)
    one = place(c1, 1, 1, -x0, y1)
    one_w, one_h = round(x1 - x0), round(y1 - y0)

    # two lines: the shorter one is scaled to the width of the longer, flush left; the gap is a share of the cap height
    la, _ = line(LINES[0])
    lb, _ = line(LINES[1])
    ax0, ay0, ax1, ay1 = bounds(la)
    bx0, by0, bx1, by1 = bounds(lb)
    wa, wb = ax1 - ax0, bx1 - bx0
    w = max(wa, wb)
    ka, kb = w / wa, w / wb
    ha, hb_ = (ay1 - ay0) * ka, (by1 - by0) * kb
    gap = LEAD_CAP * cap * min(ka, kb)
    top = place(la, ka, ka, -ax0 * ka, ay1 * ka)
    bottom = place(lb, kb, kb, -bx0 * kb, ha + gap + by1 * kb)
    two = top + bottom
    two_w, two_h = round(w), round(ha + gap + hb_)

    lc1, lc2 = measure(one), measure(two)
    if len(lc1) != 18 or len(lc2) != 18:
        die(f'expected 18 contours in both layouts, got {len(lc1)} and {len(lc2)}')
    return dict(
        one=dict(w=one_w, h=one_h, cap=cap, lc=lc1, d=serialize(one)),
        two=dict(w=two_w, h=two_h, cap=round(cap * kb), lc=lc2, d=serialize(two)),
    )


def render(m):
    f = FONT
    return f"""// GENERATED by web/scripts/v3-wordmark.py: do not edit by hand (run the script, or `--check` it).
//
// «AI FROM SCRATCH», the wordmark at the very end of /v3, as the outlines of the letters. The page ships these paths and never draws the text with a font.
//   font     {f['name']} {f['version']} · {f['source']} at {f['commit'][:12]}, {f['path']}
//   sha256   {f['sha256']}
//   licence  {f['license']} ({f['licenseUrl']}) · {f['copyright']}
//   made by  fonttools + HarfBuzz (kerning on), the word space {SPACE_EM} em, {UPM} units per em, integers, relative commands (y down)
// Geist is an OFL font; the licence lets its glyphs be used in a graphic like this one. SF Pro is not (its licence forbids it): it is never used for this.
// `w` x `h` is the ink box in units; `cap` the cap height of the bottom line (the page crops a share of it off the bottom); `lc` the length of each contour, in the order of the path (the footer's runners are sized and timed by them).

export const WORDMARK = {{
  text: '{TEXT}',
  lines: ['{LINES[0]}', '{LINES[1]}'],
  contours: 18,
  font: {{ name: '{f['name']}', version: '{f['version']}', source: '{f['source']}', commit: '{f['commit']}', path: '{f['path']}', sha256: '{f['sha256']}', license: '{f['license']}', copyright: '{f['copyright']}' }},
  /** one line: desktop */
  one: {{ w: {m['one']['w']}, h: {m['one']['h']}, cap: {m['one']['cap']}, lc: [{', '.join(map(str, m['one']['lc']))}], d: '{m['one']['d']}' }},
  /** two lines, AI FROM over SCRATCH: phones */
  two: {{ w: {m['two']['w']}, h: {m['two']['h']}, cap: {m['two']['cap']}, lc: [{', '.join(map(str, m['two']['lc']))}], d: '{m['two']['d']}' }},
}} as const;
"""


def main():
    argv = sys.argv[1:]
    local = argv[argv.index('--font') + 1] if '--font' in argv else None
    text = render(build(load_font_bytes(local)))
    if '--check' in argv:
        have = open(OUT).read() if os.path.exists(OUT) else ''
        if have != text:
            die(f'{os.path.relpath(OUT)} is not what the pinned font gives: run the script without --check')
        print('v3-wordmark: ok (the committed file is what the pinned font gives)')
        return
    open(OUT, 'w').write(text)
    print(f'v3-wordmark: wrote {os.path.relpath(OUT)} ({len(text)} bytes)')


if __name__ == '__main__':
    main()
