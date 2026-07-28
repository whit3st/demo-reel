#!/usr/bin/env node
/**
 * Move everything under "## [Unreleased]" into a dated section for `version`.
 *
 * Usage: node scripts/release-changelog.mjs 0.10.0
 *        ALLOW_EMPTY_CHANGELOG=1 node scripts/release-changelog.mjs 0.10.0
 */
import { readFileSync, writeFileSync } from "fs";

const CHANGELOG = "CHANGELOG.md";
const UNRELEASED = "## [Unreleased]";

const version = process.argv[2];
if (!version) {
  console.error("Usage: node scripts/release-changelog.mjs <version>");
  process.exit(1);
}

const changelog = readFileSync(CHANGELOG, "utf-8");

const unreleasedStart = changelog.indexOf(UNRELEASED);
if (unreleasedStart === -1) {
  console.error(`${CHANGELOG} has no "${UNRELEASED}" section`);
  process.exit(1);
}

const bodyStart = unreleasedStart + UNRELEASED.length;
const nextHeading = changelog.indexOf("\n## ", bodyStart);
const bodyEnd = nextHeading === -1 ? changelog.length : nextHeading;
const body = changelog.slice(bodyStart, bodyEnd).trim();

if (!body && !process.env.ALLOW_EMPTY_CHANGELOG) {
  console.error(
    `Nothing under "${UNRELEASED}" in ${CHANGELOG}.\n` +
      `Describe the release there first, or set ALLOW_EMPTY_CHANGELOG=1 to release without notes.`,
  );
  process.exit(1);
}

const now = new Date();
const date = [
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, "0"),
  String(now.getDate()).padStart(2, "0"),
].join("-");

const released = `## [${version}] - ${date}`;
const section = body ? `${released}\n\n${body}` : released;

const updated =
  `${changelog.slice(0, unreleasedStart)}${UNRELEASED}\n\n${section}\n` +
  `${changelog.slice(bodyEnd)}`;

writeFileSync(CHANGELOG, updated);
console.log(`${CHANGELOG}: ${released}`);
