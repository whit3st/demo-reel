---
name: pr-workflow
description: Use ONLY when working in the demo-reel repo and user asks to commit, create a PR, wait for CI checks, and merge it. Handles the full cycle for this specific repo: format (oxfmt), build (tsgo), test (vitest), commit, push, open PR, wait for CI, squash-merge, pull main. Triggers on "commit, open a pr, wait for CI, merge", "send this as a PR", "PR this".
---

# PR Workflow (demo-reel)

Automates the full GitHub PR lifecycle for this repository.

## Prerequisite checks

Before starting, verify:

- Working directory is the repo root
- User is on a feature branch (not `main`/`master`)

If on `main`/`master`, create a new feature branch automatically before proceeding:

```bash
git checkout -b feature/<descriptive-slug>
```

## Step 1 — Format, build, test

Run the repo's quality commands if available:

- Format: `pnpm format` (or equivalent)
- Build: `pnpm build`
- Test: `pnpm test`

If any fail, stop and report the error. Do NOT proceed with a broken build.

## Step 2 — Commit

```bash
git status
git add -A
git commit -m "<conventional commit message>"
```

Use conventional commit format: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `test:`.

Write a descriptive body that explains what changed and why. No signature in the message or body.

If there are unrelated changes (e.g., generated output files, temp files), warn the user before staging them. Do NOT silently include unwanted files.

## Step 3 — Push

```bash
git push origin <branch-name>
```

## Step 4 — Open PR

```bash
gh pr create \
  --title "<title matching commit>" \
  --body "<detailed description of changes>"
```

The PR body should include:

- Summary of what changed
- Key implementation details
- Testing performed

## Step 5 — Wait for CI

```bash
gh pr checks --watch
```

This polls every 10 seconds until all checks complete. If any check fails, stop and report which ones failed.

To re-check after a failure: `gh pr checks`

## Step 6 — Merge

Only proceed if ALL checks passed.

```bash
gh pr merge --squash --delete-branch
```

This squash-merges into the default branch and deletes the remote feature branch.

## Step 7 — Pull main

Switch to main and pull:

```bash
git checkout main
git pull origin main
```

## Variation: branch already exists

If the user already created a branch (e.g., `feature/dry-run-flag`), start from Step 2. Do not re-create or rename the branch.

## Variation: branch not pushed yet

If `git push` fails because the branch doesn't exist on remote, use:

```bash
git push -u origin <branch-name>
```

## Variation: commit already made

If `git status` shows no staged/unstaged changes on the feature branch, and all quality checks passed, skip directly to Step 5 (wait for CI) — the PR is already open.

## Variation: PR already open

If `gh pr list` shows an existing PR for the current branch, skip Step 4. Use:

```bash
gh pr checks --watch
```

to wait for CI, then `gh pr merge --squash --delete-branch`.
