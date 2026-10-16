#!/usr/bin/env bash
# Rebuild the local-only QA tree: PR12 (includes PR9) + PR10.
# Does not push, merge to the GitHub default branch, or change remotes.
set -euo pipefail

ROOT="${1:-paksho-qa}"
REMOTE="${REMOTE:-https://github.com/antigravity1344-code/my-mobile-app.git}"
PR12_SHA="a41a50855cdadc1a5445564c2318ad334b782906"
PR10_SHA="ef061ccdee4e00a3558fec773ad91a43010535cf"

if [[ -e "$ROOT" ]]; then
  echo "Refuse to overwrite existing path: $ROOT" >&2
  exit 1
fi

git clone "$REMOTE" "$ROOT"
cd "$ROOT"
git fetch origin \
  refs/heads/fix/server-acceptance-005:refs/heads/pr12 \
  refs/heads/ui/ux-ui-development:refs/heads/pr10

actual12="$(git rev-parse pr12)"
actual10="$(git rev-parse pr10)"
if [[ "$actual12" != "$PR12_SHA" || "$actual10" != "$PR10_SHA" ]]; then
  echo "HEAD mismatch. pr12=$actual12 expected $PR12_SHA" >&2
  echo "pr10=$actual10 expected $PR10_SHA" >&2
  echo "Stop rather than combining unexpected SHAs." >&2
  exit 2
fi

git switch -c qa/pr9-pr12-pr10-local pr12
git merge pr10 --no-ff -m "qa(local): combine PR9+PR12 lifecycle with PR10 isolated UI preview"
echo "Local QA HEAD: $(git rev-parse HEAD)"
echo "Do not push this branch unless the owner explicitly asks."
