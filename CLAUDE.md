# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

demo-reel is a CLI tool (v0.6.0, MIT) for creating professional demo videos from web applications. Users write demo scripts in TypeScript (`.demo.ts` files), and the tool uses Playwright to automate a browser, records the video, generates voiceover narration via TTS, and outputs MP4 videos + SRT/VTT subtitles + scene metadata.

## Build / Test / Lint Commands

```bash
pnpm install          # install dependencies
pnpm build            # build with tsgo (native TypeScript compiler)
pnpm build:tsc        # build with tsc (fallback)
pnpm dev              # watch mode (tsc)
pnpm test             # run all tests (vitest)
pnpm test:coverage    # test with v8 coverage
pnpm test:watch       # test in watch mode
pnpm lint             # lint with oxlint
pnpm format           # format with oxfmt
pnpm demo             # run CLI from source (via tsx)
```

## Tech Stack

- **Runtime:** Node.js 18+, TypeScript, pnpm
- **Build:** tsgo (default), tsc (fallback)
- **Testing:** Vitest with v8 coverage
- **Lint/Format:** oxlint + oxfmt (Oxc Rust-based tools, not ESLint/Prettier)
- **Browser Automation:** Playwright (peer dependency)
- **Audio/Video:** FFmpeg (via ffmpeg-static)
- **Validation:** Zod v4
- **Optional peers:** @anthropic-ai/sdk (Claude API), openai (OpenAI TTS)

## Architecture

### Command Pattern CLI (`src/commands/`)

Every CLI operation is implemented as a class implementing the `Command` interface (`{ name, validate(), execute() }`). A `CommandRegistry` handles discovery. `CommandContext` provides dependency injection for filesystem and console, making commands testable.

### Zod-First Validation (`src/schemas.ts`, 725 lines)

All config flows through two Zod schema phases:

1. **Input schema** — accepts preset strings (e.g., `cursor: "dot"`)
2. **Output schema** — normalized/resolved objects (presets expanded)

Scene-owned steps (`scenes[].steps[]`) are normalized into the runtime format (flat `steps[]` + `scenes[]` with `stepIndex`). Legacy format (top-level `steps[]` + `scenes[].stepIndex`) is still supported but mixed formats are rejected.

### Execution Flow (`src/index.ts`)

`generate()` flow:

1. Validate and normalize config
2. Generate voiceover via local TTS (Piper, OpenAI, or ElevenLabs)
3. Narration auto-sync to audio timing
4. Serialize config → execute recording via Playwright locally

### Key Source Files

| File                     | Purpose                                                            |
| ------------------------ | ------------------------------------------------------------------ |
| `src/index.ts`           | Main entry: `generate()`, `defineConfig()`                         |
| `src/cli.ts`             | CLI parser and entry point                                         |
| `src/schemas.ts`         | All Zod schemas (config, steps, scenes, voice, auth)               |
| `src/runner.ts`          | Playwright step execution engine (1300 lines)                      |
| `src/video-handler.ts`   | Browser launch, auth, recording orchestration                      |
| `src/config-loader.ts`   | Load `.ts`/`.json` config files                                    |
| `src/narration-sync.ts`  | Audio-first step timing sync                                       |
| `src/audio-processor.ts` | FFmpeg audio/video merging                                         |
| `src/script/`            | AI script generation pipeline (crawler, generator, TTS, assembler) |
| `src/commands/`          | Command pattern CLI implementation                                 |

### TTS Provider Abstraction

Three providers with pluggable interface: **Piper** (local/free, default), **OpenAI**, **ElevenLabs**. Audio is cached by content hash.

### Narration Auto-Sync (`src/narration-sync.ts`)

Audio-first timing engine with three modes: `auto` (pads delays, warns), `strict` (fails on overflow), `off` (disabled).

## Coding Conventions

- **No comments** unless explicitly asked — keep code self-documenting
- Use existing patterns from surrounding files when adding new code
- Prefer Zod schemas over TypeScript interfaces for runtime behavior
- Use the Command pattern for new CLI operations (`src/commands/`)
- Inject dependencies via `CommandContext` for testability
- Selector priority: `testId` > `id` > `href` > `class` > `custom`
- Test files mirror source structure under `test/` with `.test.ts` suffix
- Never edit `package.json` to add dependencies — always use `pnpm add`
