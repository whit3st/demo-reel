.DEFAULT_GOAL := help
.ONESHELL:
.SHELLFLAGS := -eu -o pipefail -c
SHELL := bash

.PHONY: help patch minor major release verify status

VERSION := $(shell node -p "require('./package.json').version")

help:
	@echo "demo-reel release targets"
	@echo
	@echo "  make patch     $(VERSION) -> bug fixes only"
	@echo "  make minor     $(VERSION) -> new features, backwards compatible"
	@echo "  make major     $(VERSION) -> breaking changes"
	@echo
	@echo "Each one verifies, bumps package.json, dates the CHANGELOG's"
	@echo "[Unreleased] section, opens a release PR, waits for CI, merges it,"
	@echo "then tags the merged commit. Pushing the tag triggers the npm"
	@echo "publish. It asks before starting."
	@echo
	@echo "  make status    show what a release would pick up"
	@echo "  make verify    format, lint, test and build without releasing"
	@echo
	@echo "Flags:"
	@echo "  SKIP_CONFIRM=1            do not prompt before starting the release"
	@echo "  SKIP_VERIFY=1             skip local checks (CI still gates publish)"
	@echo "  ALLOW_EMPTY_CHANGELOG=1   release with no [Unreleased] notes"

status:
	@echo "version:  $(VERSION)"
	@echo "branch:   $$(git rev-parse --abbrev-ref HEAD)"
	@echo "npm:      $$(npm view demo-reel version 2>/dev/null || echo 'unknown')"
	@echo
	@echo "Commits since v$(VERSION):"
	@git log --oneline "v$(VERSION)..HEAD" 2>/dev/null || echo "  (no v$(VERSION) tag)"
	@echo
	@echo "CHANGELOG [Unreleased]:"
	@sed -n '/## \[Unreleased\]/,/^## \[/p' CHANGELOG.md | sed '1d;$$d' | sed '/^$$/d' || true

verify:
	pnpm run format:ci
	pnpm run lint:ci
	pnpm run check:architecture
	pnpm test
	pnpm build

patch minor major:
	@$(MAKE) --no-print-directory release BUMP=$@

release:
	@if [ -z "$(BUMP)" ]; then
		echo "Use 'make patch', 'make minor' or 'make major'." >&2
		exit 1
	fi

	branch=$$(git rev-parse --abbrev-ref HEAD)
	if [ "$$branch" != "main" ]; then
		echo "Releases go out from main; you are on '$$branch'." >&2
		exit 1
	fi

	if [ -n "$$(git status --porcelain)" ]; then
		echo "Working tree is dirty. Commit or stash first:" >&2
		git status --short >&2
		exit 1
	fi

	echo "==> Checking main is up to date with origin"
	git fetch --quiet origin main
	if [ "$$(git rev-parse HEAD)" != "$$(git rev-parse origin/main)" ]; then
		echo "Local main and origin/main have diverged. Pull or push first." >&2
		exit 1
	fi

	if [ -z "$${SKIP_VERIFY:-}" ]; then
		echo "==> Verifying (format, lint, test, build)"
		$(MAKE) --no-print-directory verify
	else
		echo "==> Skipping local verification (SKIP_VERIFY set)"
	fi

	echo "==> Bumping $(BUMP) from $(VERSION)"
	pnpm version "$(BUMP)" --no-git-tag-version >/dev/null
	new=$$(node -p "require('./package.json').version")

	if git rev-parse -q --verify "refs/tags/v$$new" >/dev/null \
		|| git ls-remote --exit-code --tags origin "refs/tags/v$$new" >/dev/null 2>&1; then
		echo "Tag v$$new already exists; aborting." >&2
		git checkout -- package.json CHANGELOG.md
		exit 1
	fi

	release_branch="chore/release-v$$new"
	if git show-ref --verify --quiet "refs/heads/$$release_branch" \
		|| git ls-remote --exit-code --heads origin "$$release_branch" >/dev/null 2>&1; then
		echo "Branch $$release_branch already exists; aborting." >&2
		git checkout -- package.json CHANGELOG.md
		exit 1
	fi

	# Restore package.json and CHANGELOG.md if a local step fails.
	trap 'git checkout -- package.json CHANGELOG.md 2>/dev/null || true' ERR

	echo "==> Dating the CHANGELOG"
	node scripts/release-changelog.mjs "$$new"

	echo
	echo "  $(VERSION) -> $$new"
	echo
	git --no-pager diff --stat
	echo

	if [ -z "$${SKIP_CONFIRM:-}" ]; then
		printf "Release v%s via PR and tag? This publishes to npm and cannot be undone. [y/N] " "$$new"
		read -r reply < /dev/tty
		case "$$reply" in
			[yY]*) ;;
			*)
				echo "Aborted; package.json and CHANGELOG.md restored." >&2
				git checkout -- package.json CHANGELOG.md
				exit 1
				;;
		esac
	fi

	trap - ERR

	echo "==> Creating $$release_branch"
	git switch -c "$$release_branch"
	git commit --quiet -am "chore: release v$$new"

	echo "==> Pushing $$release_branch"
	git push --quiet --set-upstream origin "$$release_branch"

	echo "==> Opening release PR"
	pr_url=$$(gh pr create --base main --head "$$release_branch" \
		--title "chore: release v$$new" \
		--body "Release v$$new. Bumps package.json and dates the CHANGELOG." | tail -n1)
	echo "$$pr_url"
	pr_number=$${pr_url##*/}

	echo "==> Waiting for CI"
	if ! gh pr checks "$$pr_number" --watch; then
		echo "CI failed for $$pr_url; the release branch and PR remain." >&2
		exit 1
	fi

	echo "==> Merging release PR"
	gh pr merge "$$pr_number" --merge --delete-branch

	echo "==> Syncing main"
	git switch main
	git pull --quiet --ff-only origin main
	git branch -D "$$release_branch" 2>/dev/null || true

	if [ "$$(node -p "require('./package.json').version")" != "$$new" ]; then
		echo "main does not contain v$$new after merge" >&2
		exit 1
	fi

	echo "==> Tagging v$$new"
	git tag -a "v$$new" -m "v$$new"
	git push --quiet origin "v$$new"

	echo
	echo "Released v$$new. The tag push triggers CI, then the npm publish."
	echo "  https://github.com/whit3st/demo-reel/actions"
