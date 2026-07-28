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
	@echo "[Unreleased] section, commits, tags and pushes. Pushing the tag is"
	@echo "what triggers the npm publish, so it asks before doing that."
	@echo
	@echo "  make status    show what a release would pick up"
	@echo "  make verify    format, lint, test and build without releasing"
	@echo
	@echo "Flags:"
	@echo "  SKIP_CONFIRM=1            do not prompt before pushing"
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

	# Restore package.json if anything below fails, so a bad run leaves no trace.
	trap 'git checkout -- package.json CHANGELOG.md 2>/dev/null || true' ERR

	echo "==> Dating the CHANGELOG"
	node scripts/release-changelog.mjs "$$new"

	echo
	echo "  $(VERSION) -> $$new"
	echo
	git --no-pager diff --stat
	echo

	if [ -z "$${SKIP_CONFIRM:-}" ]; then
		printf "Push v%s? This publishes to npm and cannot be undone. [y/N] " "$$new"
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

	git commit --quiet -am "chore: release v$$new"
	git tag -a "v$$new" -m "v$$new"
	git push --quiet origin main
	git push --quiet origin "v$$new"

	echo
	echo "Released v$$new. The tag push triggers CI, then the npm publish."
	echo "  https://github.com/whit3st/demo-reel/actions"
