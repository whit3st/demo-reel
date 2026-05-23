#!/usr/bin/env node
import { spawn } from "child_process";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const SKILL_URL =
  "https://raw.githubusercontent.com/whit3st/demo-reel/main/.claude-plugin/commands/demo-script.md";

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
  const crawlCliPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../dist/script/crawl-cli.js",
  );
  const proc = spawn(process.execPath, [crawlCliPath, ...args.slice(1)], {
    stdio: "inherit",
  });
  forwardSignals(proc);
  proc.on("close", (code) => process.exit(code ?? 1));
} else if (args.length > 0) {
  const cliPath = resolve(dirname(fileURLToPath(import.meta.url)), "../dist/cli.js");
  const proc = spawn(process.execPath, ["--import", "tsx/esm", cliPath, ...args], {
    stdio: "inherit",
  });
  forwardSignals(proc);
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

function forwardSignals(child) {
  const signals = ["SIGINT", "SIGTERM"];
  const forward = (signal) => {
    if (!child.killed) {
      child.kill(signal);
    }
  };

  for (const signal of signals) {
    process.on(signal, () => forward(signal));
  }

  process.on("exit", () => {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  });
}
