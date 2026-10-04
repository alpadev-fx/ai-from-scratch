#!/bin/sh
# Builds the grayscale WebP frame packs the /v3 landing scrubs with the scroll.
#   sh web/scripts/v3-frames.sh <id> <source.mp4>
# Output: web/public/v3/seq/<id>/{d,m}/0001.webp…  (d = desktop, m = mobile)
# plus web/public/v3/poster/<id>.webp (tiny, for instant paint; CSS blurs it)
# and web/public/v3/still/<id>.webp (the static frame the no-motion page shows).
# Needs ffmpeg + cwebp (brew install ffmpeg webp). Fails if either is missing.
#
#   FROM=1.875 FPS_D=12 N_D=56 FPS_M=12 N_M=56 sh web/scripts/v3-frames.sh n2 <N2.mp4>
# cuts a window out of the clip instead of its first seconds (every one is optional; the defaults are the packs the hero shipped with):
#   FROM  second of the source the pack starts at (0)         FPS_D  desktop frames per second (9)   N_D  desktop frames (72)
#                                                             FPS_M  mobile frames per second (6)    N_M  mobile frames (48)
# A rate that divides the source's own (24 fps: 12, 8, 6) takes every 2nd, 3rd, 4th frame, evenly; any other rate takes uneven steps. The old pack is cleared first.
set -eu
command -v ffmpeg >/dev/null || { echo "ffmpeg missing" >&2; exit 1; }
command -v cwebp  >/dev/null || { echo "cwebp missing"  >&2; exit 1; }
id="$1"; src="$2"; here="$(cd "$(dirname "$0")/.." && pwd)"; out="$here/public/v3"
tmp="$(mktemp -d)"; trap 'rm -rf "${tmp:?}"' EXIT
FROM="${FROM:-0}"; FPS_D="${FPS_D:-9}"; N_D="${N_D:-72}"; FPS_M="${FPS_M:-6}"; N_M="${N_M:-48}"
GRADE="eq=contrast=1.12,format=gray,format=rgb24"
mkdir -p "$out/seq/$id/d" "$out/seq/$id/m" "$out/poster" "$out/still"
rm -f "${out:?}/seq/${id:?}/d/"*.webp "${out:?}/seq/${id:?}/m/"*.webp          # a shorter pack must not leave the tail of the old one behind
# desktop: source is 720x1280 portrait, no upscaling. N_D frames at FPS_D from second FROM (default: 72 frames over 8 s).
ffmpeg -v error -y -ss "$FROM" -i "$src" -vf "fps=$FPS_D,$GRADE" -frames:v "$N_D" "$tmp/d%04d.png"
for f in "$tmp"/d*.png; do b=$(basename "$f" .png); cwebp -quiet -q 74 -m 6 -sharp_yuv "$f" -o "$out/seq/$id/d/${b#d}.webp"; done
# mobile: 540 wide, N_M frames at FPS_M (default 48)
ffmpeg -v error -y -ss "$FROM" -i "$src" -vf "fps=$FPS_M,scale=540:-2:flags=lanczos,$GRADE" -frames:v "$N_M" "$tmp/m%04d.png"
for f in "$tmp"/m*.png; do b=$(basename "$f" .png); cwebp -quiet -q 68 -m 6 "$f" -o "$out/seq/$id/m/${b#m}.webp"; done
# poster: 48 px wide first frame of the pack (CSS blurs and stretches it)
ffmpeg -v error -y -ss "$FROM" -i "$src" -vf "scale=48:-2,$GRADE" -frames:v 1 "$tmp/p.png"
cwebp -quiet -q 40 "$tmp/p.png" -o "$out/poster/$id.webp"
# still: static composed frame for no-motion / no-WebGL (frame at STILL_T seconds)
ffmpeg -v error -y -ss "${STILL_T:-3.5}" -i "$src" -vf "scale=540:-2:flags=lanczos,$GRADE" -frames:v 1 "$tmp/s.png"
cwebp -quiet -q 62 "$tmp/s.png" -o "$out/still/$id.webp"
echo "$id: $(ls "$out/seq/$id/d" | wc -l) desktop / $(ls "$out/seq/$id/m" | wc -l) mobile frames"
