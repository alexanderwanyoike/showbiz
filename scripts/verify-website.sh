#!/usr/bin/env bash
# Verifies the static site in site/ before any deploy.
#
# The pages workflow substitutes __VERSION__, __VERSION_NUM__ and
# __RELEASE_DATE__ into site/index.html and fails the deploy if a
# placeholder survives. This script holds the other side of that
# contract: the placeholders must actually be present, and every
# locally referenced asset must exist on disk.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
page="$root/site/index.html"

fail() {
  echo "::error::$1"
  exit 1
}

[[ -f "$page" ]] || fail "site/index.html not found"

# The substitution contract: every placeholder the workflow expects
# must occur at least once, otherwise a redesign silently broke the
# version stamping and the page would ship stale or empty download info.
for placeholder in __VERSION__ __VERSION_NUM__ __RELEASE_DATE__; do
  grep -q "$placeholder" "$page" \
    || fail "site/index.html is missing the $placeholder placeholder"
done

# Canonical URL keeps og/twitter cards resolving to the Pages origin.
grep -q 'rel="canonical"' "$page" \
  || fail "site/index.html is missing a canonical link"

if grep -qiE 'images/timeline\.png|multi-track|export a (finished|final) movie|trim and arrange' "$page"; then
  fail "site/index.html still advertises the retired timeline editor"
fi

for asset in 'Showbiz-__VERSION_NUM__.AppImage' 'showbiz___VERSION_NUM___amd64.deb' 'Showbiz-__VERSION_NUM__-arm64.dmg' 'Showbiz.Setup.__VERSION_NUM__.exe'; do
  grep -Fq "releases/download/__VERSION__/$asset\"" "$page" \
    || fail "site/index.html is missing the release download: $asset"
done

while IFS= read -r anchor; do
  grep -Fq "id=\"$anchor\"" "$page" \
    || fail "site/index.html links to missing section: $anchor"
done < <(grep -oE 'href="#[^"]+"' "$page" | sed 's/href="#//; s/"$//' | sort -u)

# Every local href/src must resolve to a file inside site/. Skips
# absolute URLs, anchors and data URIs.
while IFS= read -r ref; do
  path="${ref%%\#*}"
  [[ -n "$path" ]] || continue
  [[ -f "$root/site/$path" ]] \
    || fail "site/index.html references missing asset: $path"
done < <(grep -oE '(href|src)="[^"#][^"]*"' "$page" \
  | sed -E 's/^(href|src)="//; s/"$//' \
  | grep -vE '^(https?:|//|data:|mailto:)' \
  | sort -u)

echo "site verification passed"
