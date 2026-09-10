#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
targets="
$root/api/dist
$root/payments/dist
$root/web/dist
$root/web/.astro
$root/ai/.pytest_cache
$root/ai/.ruff_cache
$root/ai/src/course_ai/__pycache__
$root/ai/src/course_ai/agent/__pycache__
$root/ai/src/course_ai/ontology/__pycache__
$root/ai/src/course_ai/retrieval/__pycache__
$root/ai/tests/__pycache__
$root/scripts/__pycache__
$root/android/app/build
$root/android/build
$root/android/.gradle
$root/ios/build
$root/ios/build-sim
$root/ios/build-device"
echo "$targets" | while IFS= read -r p; do
  [ -n "$p" ] || continue
  case "$p" in "$root"/*) ;; *) echo "refusing path: $p" >&2; exit 1;; esac
  if [ -e "$p" ]; then du -sh "$p"; rm -rf -- "$p"; fi
done
echo "cache purge complete"
