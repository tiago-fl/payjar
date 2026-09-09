#!/usr/bin/env bash
# Build and publish dist/ to the gh-pages branch (GitHub Pages, legacy source).
# Usage: ./deploy.sh [remote-url]   (defaults to origin)
set -euo pipefail
cd "$(dirname "$0")"
REMOTE="${1:-origin}"
npm run build
touch dist/.nojekyll
TMPD="$(mktemp -d)"
git worktree prune
git worktree add -q --detach "$TMPD"
(
  cd "$TMPD"
  git checkout -q --orphan gh-pages
  git rm -rfq . >/dev/null 2>&1 || true
  cp -r "$OLDPWD/dist/." .
  git -c core.autocrlf=false add -A
  git -c core.autocrlf=false commit -qm "Deploy CookiePay $(date -u +%Y-%m-%dT%H:%MZ)"
  git push -f "$REMOTE" gh-pages
)
git worktree remove --force "$TMPD"
git branch -D gh-pages -q 2>/dev/null || true
echo "Deployed to gh-pages"
