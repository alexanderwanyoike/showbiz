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
