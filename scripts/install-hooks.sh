#!/usr/bin/env bash
# v6.29 P2 — copy our git hooks into .git/hooks/ (idempotent).
# Run: npm run hooks:install
#
# Why copy vs symlink: WSL / cross-FS setups sometimes break symlinks
# silently. A copy + size-check is the safest cross-platform pattern.
set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$REPO_ROOT/scripts/git-hooks"
DST="$REPO_ROOT/.git/hooks"

if [ ! -d "$DST" ]; then
  echo "✗ .git/hooks not found — are you inside a git checkout?"
  exit 1
fi

for hook in "$SRC"/*; do
  name="$(basename "$hook")"
  cp -f "$hook" "$DST/$name"
  chmod +x "$DST/$name"
  echo "✓ installed $name → .git/hooks/$name"
done

echo ""
echo "Hooks active. Disable per-push with OFFICE_ZOO_SKIP_CHANGELOG_NUDGE=1 git push"
