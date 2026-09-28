# Script Module

## Purpose

AI script generation pipeline for demo-reel. Crawls a live page for stable selectors, asks an LLM to draft narrated scenes from a natural-language description, synthesizes per-scene voiceover, stretches step timing to fit the audio, and emits a runnable `.demo.ts` config. Invoked via `demo-reel script`.

## Location

`src/script/` (pipeline) + `src/commands/script/` (CLI commands)

## File Map

| File           | Concern                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------- |
| `crawler.ts`   | Playwright DOM crawl: interactive elements, stable selectors, `formatPageContext`         |
| `generator.ts` | LLM script draft: `generateScript`, `validateScript`, `fixBrokenSteps`                    |
| `timing.ts`    | Step duration estimates, `synchronizeTiming` pads steps to narration length               |
| `tts.ts`       | `generateVoiceSegments`, `generateNarrationAudio` via `voice/` providers                  |
| `assembler.ts` | `writeDemoConfig`, `writeScriptJson` — emits `.demo.ts` + `.script.json`                  |
| `explore.ts`   | Interactive site explorer: click-through discovery as a standalone script                 |
| `crawl-cli.ts` | Standalone crawler entry (`dist/script/crawl-cli.js`, JSON or text output)                |
| `voice-cli.ts` | Standalone voiceover entry (`dist/script/voice-cli.js`)                                   |
| `types.ts`     | Zod schemas: `CrawledPage`, `ScriptScene`, `DemoScript`, `TimedScript`                    |
| `cli.ts`       | Orchestration: `scriptGenerate` / `Voice` / `Build` / `Validate` / `Fix` / `FullPipeline` |
| `index.ts`     | Re-exports                                                                                |

## Subcommands

Routed by `ScriptRouterCommand` (`src/commands/script/router.ts`); each subcommand is a `Command` under `src/commands/script/`. A bare description falls through to `pipeline`.

### `generate` — Draft a script

```ts
scriptGenerate(description, url, outputName, { hints, headed, verbose }) → Promise<string>
```

Crawls `--url`, prompts the LLM with the DOM context, writes `<name>.script.json`.

### `voice` — Synthesize narration

```ts
scriptVoice(scriptPath, voice, { noCache, verbose }) → Promise<string>
```

Generates per-scene audio, concatenates to `<name>-narration.mp3`, stamps measured timings back into the `.script.json` via `synchronizeTiming`.

### `build` — Emit runnable config

```ts
scriptBuild(scriptPath, { resolution, format, verbose }) → Promise<string>
```

Requires voice timing data (fails otherwise). Writes `<name>.demo.ts` via `writeDemoConfig`.

### `validate` — Replay steps headlessly

```ts
scriptValidate(scriptPath, { headed, verbose }) → Promise<boolean>
```

Runs every scene step with `runStepSimple`, reports `scene/step/action/error` failures. Exit code reflects the result.

### `fix` — Repair broken selectors

```ts
scriptFix(scriptPath, { headed, verbose }) → Promise<void>
```

Validates, re-crawls and LLM-repairs failures via `fixBrokenSteps`, rewrites the script, then re-validates.

### `pipeline` — Full run (default)

```ts
scriptFullPipeline(description, url, { output, voice, hints, resolution, format }) → Promise<string>
```

`generate → validate → fix (if needed) → voice → build`. Prints the `demo-reel <name>` record command on completion.

## Pipeline Flow

```
crawler → generator → timing → tts → assembler
```

1. **crawler** — `crawlUrl()` captures interactive elements with stable selectors (`testId` > `id` > `href` > `class` > `custom`); `formatPageContext()` renders the LLM prompt context.
2. **generator** — `generateScript()` sends description + page context to the LLM, parses the `DemoScript` (scenes of narration + steps); `validateScript` / `fixBrokenSteps` close the loop against the live page.
3. **timing** — `synchronizeTiming()` estimates step durations and pads delays so steps fill each scene's narration window.
4. **tts** — `generateVoiceSegments()` synthesizes narration per scene (cached by content hash), `generateNarrationAudio()` concatenates clips and writes the narration manifest.
5. **assembler** — `writeDemoConfig()` serializes the timed script to a `.demo.ts` config; `writeScriptJson()` round-trips the intermediate `.script.json`.

## Naming Note

The explorer file is `explore.ts`, not `explorer.ts`. It is a standalone click-through discovery script (log in, follow nav links, dump page inventories), distinct from the one-shot DOM crawl in `crawler.ts`.
