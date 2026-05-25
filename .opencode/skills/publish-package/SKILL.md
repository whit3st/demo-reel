---
name: publish-package
description: Use ONLY when user asks to publish a new version of demo-reel. Handles the full cycle: determine next version, update CHANGELOG, bump package.json, commit, tag, push, wait for publish CI, verify npm release. Triggers on "publish a new version", "publish this", "ship it", "cut a release".
---

# Publish demo-reel

Handles the full version release lifecycle.

## Preflight

```bash
git pull origin main
git status
```

Stop if: not on `main`, uncommitted changes (other than changelog/package.json), or open PRs for pending features.

## Step 1 — Determine next version

```bash
node -p "require('./package.json').version"
git log $(git describe --tags --abbrev=0)..HEAD --oneline
```

Determine bump:
- **patch** (0.7.4 → 0.7.5): bug fixes, minor improvements
- **minor** (0.7.4 → 0.8.0): new features, backward-compatible
- **major** (0.7.4 → 1.0.0): breaking changes

Ask user for confirmation if ambiguous.

## Step 2 — Update CHANGELOG

Edit `CHANGELOG.md`:
1. Replace `## [Unreleased]` with `## [X.Y.Z] - YYYY-MM-DD`
2. Add a new empty `## [Unreleased]` section above it

## Step 3 — Bump version

Update `"version"` in `package.json` to the new version.

## Step 4 — Verify quality

Before committing, ensure the changes pass:
```bash
pnpm format
pnpm build
```

Stop if either fails.

## Step 5 — Commit, tag, push

```bash
git add CHANGELOG.md package.json
git commit -m "chore: bump version to X.Y.Z"
git tag vX.Y.Z
git push origin main --tags
```

## Step 6 — Wait for publish CI

```bash
gh run list --workflow=publish.yml --limit 3
gh run watch <run-id>
```

If it fails, inspect: `gh run view <run-id> --log`

## Step 7 — Verify

```bash
npm view demo-reel version
```

Then pull main to get auto-committed SBOM/audit/coverage updates from the `Update Artifacts` workflow.
