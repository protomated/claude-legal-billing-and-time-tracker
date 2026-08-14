#!/usr/bin/env bash
# Build legal-billing.zip and publish it as a GitHub release asset.
#
# Used by both `npm run release` (local, authed via `gh auth login`) and
# `npm run release:ci` (GitHub Actions, authed via GH_TOKEN).
#
# The release tag is v<package.json version>, unless the workflow was
# triggered by a tag push, in which case that tag wins.
set -euo pipefail

cd "$(dirname "$0")/../.."

if [[ "${GITHUB_REF_TYPE:-}" == "tag" && -n "${GITHUB_REF_NAME:-}" ]]; then
  TAG="$GITHUB_REF_NAME"
else
  TAG="v$(node -p "require('./package.json').version")"
fi

npm run pack

ASSET="legal-billing.zip"

if gh release view "$TAG" >/dev/null 2>&1; then
  echo "Release $TAG exists — replacing $ASSET"
  gh release upload "$TAG" "$ASSET" --clobber
else
  echo "Creating release $TAG"
  # `gh release create` also creates the tag on GitHub if it doesn't exist.
  gh release create "$TAG" "$ASSET" --title "$TAG" --notes-file RELEASE.md
fi

echo "Published $ASSET to release $TAG"
