#!/usr/bin/env node
import { execSync, spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

const SKILL_URL =
  "https://raw.githubusercontent.com/whit3st/demo-reel/main/.claude-plugin/commands/demo-script.md";
const DEFAULT_IMAGE = "ghcr.io/whit3st/demo-reel:latest";
const LOCAL_IMAGE = "demo-reel:latest";

const args = process.argv.slice(2);

if (args[0] === "setup") {
  console.log(`demo-reel setup

Install the /demo-script Claude Code plugin to build demo scripts interactively.

Option 1 — Claude Code plugin (recommended):
  /plugin marketplace add whit3st/demo-reel
  /plugin install demo-reel@whit3st-demo-reel

Option 2 — Manual copy:
  mkdir -p .claude/commands
  curl -sL ${SKILL_URL} -o .claude/commands/demo-script.md

Then use /demo-script in Claude Code to create demo videos collaboratively.`);
} else if (args[0] === "explore") {
  const image = getImage();
  const dockerArgs = [
    "run",
    "--rm",
    "-v",
    `${process.cwd()}:/work:z`,
    "-w",
    "/work",
    "--entrypoint",
    "node",
    image,
    "/app/dist/script/crawl-cli.js",
    ...args.slice(1),
  ];
  const proc = spawn("docker", dockerArgs, { stdio: "inherit" });
  proc.on("close", (code) => process.exit(code ?? 1));
} else {
  console.log(`demo-reel — Create demo videos from web apps

Usage in your code:
  import { generate } from "demo-reel";
  await generate({ steps: [...], scenes: [...] }, { verbose: true });

CLI commands:
  demo-reel setup              Install the Claude Code plugin
  demo-reel explore <url>      Crawl a page and show selectors`);
}

function getImage() {
  try {
    execSync(`docker image inspect ${LOCAL_IMAGE}`, { stdio: "ignore" });
    return LOCAL_IMAGE;
  } catch {
    /* no local image */
  }
  try {
    execSync(`docker image inspect ${DEFAULT_IMAGE}`, { stdio: "ignore" });
    return DEFAULT_IMAGE;
  } catch {
    console.log(`Pulling ${DEFAULT_IMAGE}...`);
    execSync(`docker pull ${DEFAULT_IMAGE}`, { stdio: "inherit" });
    return DEFAULT_IMAGE;
  }
}
