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

## Step 2 — Run the release target

From the repo root, on a clean, up-to-date `main`:

```bash
make patch   # or make minor / make major
```

The Makefile verifies, bumps `package.json`, dates the `[Unreleased]`
section, opens a release PR, waits for CI, merges it, then tags the merged
commit and pushes the tag. `SKIP_CONFIRM=1` skips the prompt;
`SKIP_VERIFY=1` skips the local checks (CI still gates the publish).

## Step 3 — Wait for publish CI

```bash
gh run list --workflow=publish.yml --limit 3
gh run watch <run-id>
```

If it fails, inspect: `gh run view <run-id> --log`

## Step 4 — Verify

```bash
npm view demo-reel version
```

Then pull main.
