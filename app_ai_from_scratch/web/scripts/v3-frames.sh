#!/bin/sh
# Builds the grayscale WebP frame packs the /v3 landing scrubs with the scroll.
#   sh web/scripts/v3-frames.sh <id> <source.mp4>
# Output: web/public/v3/seq/<id>/{d,m}/0001.webp…  (d = desktop, m = mobile)
# plus web/public/v3/poster/<id>.webp (tiny, for instant paint; CSS blurs it)
# and web/public/v3/still/<id>.webp (the static frame the no-motion page shows).
# Needs ffmpeg + cwebp (brew install ffmpeg webp). Fails if either is missing.
#
#   LENS=1 sh web/scripts/v3-frames.sh <id> <source.mp4>
# builds instead the chapter-03 lens pack (src/aegis/fx/c03.ts): ONE grayscale WebP sprite of LENS_N square frames (row-major, LENS_COLS wide), cut from a
# centred square of the clip, written to web/public/v3/lens/<id>.webp. It is a few dozen KB where a scrubbed pack is hundreds.
#   LENS_T  start second (2)    LENS_FPS  frames per second (6)    LENS_N  frames (12)    LENS_COLS  sprite columns (3)
#   LENS_Y  top of the square in the 720x1280 source (300)    LENS_PX  frame size in px (288)    LENS_Q  WebP quality (58)
set -eu
command -v ffmpeg >/dev/null || { echo "ffmpeg missing" >&2; exit 1; }
command -v cwebp  >/dev/null || { echo "cwebp missing"  >&2; exit 1; }
id="$1"; src="$2"; here="$(cd "$(dirname "$0")/.." && pwd)"; out="$here/public/v3"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
GRADE="eq=contrast=1.12,format=gray,format=rgb24"
if [ "${LENS:-}" = "1" ]; then
  n="${LENS_N:-12}"; cols="${LENS_COLS:-3}"; px="${LENS_PX:-288}"; rows=$(( (n + cols - 1) / cols ))
  mkdir -p "$out/lens"
  ffmpeg -v error -y -ss "${LENS_T:-2}" -i "$src" -vf "fps=${LENS_FPS:-6},crop=720:720:0:${LENS_Y:-300},scale=${px}:${px}:flags=lanczos,$GRADE,tile=${cols}x${rows}" -frames:v 1 "$tmp/l.png"
  cwebp -quiet -q "${LENS_Q:-58}" -m 6 "$tmp/l.png" -o "$out/lens/$id.webp"
  echo "$id: lens sprite ${cols}x${rows} of ${px}px frames, $(wc -c < "$out/lens/$id.webp" | tr -d ' ') bytes"
  exit 0
fi
mkdir -p "$out/seq/$id/d" "$out/seq/$id/m" "$out/poster" "$out/still"
# desktop: source is 720x1280 portrait, no upscaling. 72 frames over 8 s.
ffmpeg -v error -y -i "$src" -vf "fps=9,$GRADE" -frames:v 72 "$tmp/d%04d.png"
for f in "$tmp"/d*.png; do b=$(basename "$f" .png); cwebp -quiet -q 74 -m 6 -sharp_yuv "$f" -o "$out/seq/$id/d/${b#d}.webp"; done
# mobile: 540 wide, 48 frames
ffmpeg -v error -y -i "$src" -vf "fps=6,scale=540:-2:flags=lanczos,$GRADE" -frames:v 48 "$tmp/m%04d.png"
for f in "$tmp"/m*.png; do b=$(basename "$f" .png); cwebp -quiet -q 68 -m 6 "$f" -o "$out/seq/$id/m/${b#m}.webp"; done
# poster: 48 px wide first frame (CSS blurs and stretches it)
ffmpeg -v error -y -i "$src" -vf "scale=48:-2,$GRADE" -frames:v 1 "$tmp/p.png"
cwebp -quiet -q 40 "$tmp/p.png" -o "$out/poster/$id.webp"
# still: static composed frame for no-motion / no-WebGL (frame at STILL_T seconds)
ffmpeg -v error -y -ss "${STILL_T:-3.5}" -i "$src" -vf "scale=540:-2:flags=lanczos,$GRADE" -frames:v 1 "$tmp/s.png"
cwebp -quiet -q 62 "$tmp/s.png" -o "$out/still/$id.webp"
echo "$id: $(ls "$out/seq/$id/d" | wc -l) desktop / $(ls "$out/seq/$id/m" | wc -l) mobile frames"
