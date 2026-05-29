# Migration Phase Plans

## Phase Dependency Graph

```
Phase 1 (ffmpeg)     ── no dependencies
      │
Phase 2 (runner)     ── depends on Phase 1 (for clean re-exports)
      │
Phase 3 (voice)      ── depends on Phase 1 (ffmpeg/utils) + Phase 2 (re-exports pattern)
      │
Phase 4 (browser)    ── depends on Phase 2 (runner re-exports)
      │
Phase 5 (pipeline)   ── depends on Phase 1–4 (all modules extracted)
      │
Phase 6 (cli)        ── depends on Phase 5 (new generate() delegates to pipeline)
```

## Principle

**Every phase is independently shippable.** After each phase:

- `pnpm build` succeeds
- `pnpm lint` passes
- `pnpm test` passes (full suite)
- Old imports keep working (re-exports from original modules)
- `.demo.ts` files unchanged

## Phase Summary

| Phase        | Creates                                                                    | Deletes                         | Lines                                            |
| ------------ | -------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------ |
| 1 — FFmpeg   | `src/ffmpeg/utils.ts`                                                      | Nothing                         | ~120 new, ~80 removed from 2 files               |
| 2 — Runner   | `src/runner/` (9 files)                                                    | Nothing                         | ~1200 lines moved, ~100 lines of re-exports left |
| 3 — Voice    | `src/voice/` (5 files)                                                     | Nothing                         | ~500 lines moved from `script/tts.ts`            |
| 4 — Browser  | `src/browser/` (3 files)                                                   | Nothing                         | ~250 lines moved from `video-handler.ts`         |
| 5 — Pipeline | `src/pipeline/` (3 files), `src/stages/` (8 files: 7 default + 1 optional) | `temp JSON write` in `index.ts` | ~300 lines new, ~200 lines refactored            |
| 6 — CLI      | Minor `cli.ts` changes                                                     | Direct `new` in cli.ts          | ~50 lines refactored                             |

## What never changes

- `src/schemas.ts` — Zod schemas (724 lines, stays put)
- `src/config-loader.ts` — Config loading (138 lines, stays put)
- `src/narration-manifest.ts` — Manifest format (41 lines, stays put)
- `src/narration-sync.ts` — Sync engine (319 lines, stays put — moves to `stages/` in Phase 5)
- `src/auth.ts` — Session management (392 lines, stays put — used by `stages/auth.ts` in Phase 5)
- `src/presets.ts` — Motion/typing/cursor/timing presets (127 lines, stays put)
- `src/random.ts` — Seeded RNG (31 lines, stays put)
- `src/voice-config.ts` — Voice config (121 lines, stays put)
- `src/interfaces.ts` — WriteFile type (1 line, stays put)
- `src/types.ts` — Type re-exports (26 lines, stays put — may add new re-exports)
- `src/run.ts` — Programmatic API (44 lines, stays put)
- `src/script/*` — AI script generation (unchanged except `tts.ts` in Phase 3)
- `test/` — All test files (mirror `src/` layout, existing tests stay, new tests added)

## Verification for every phase

```bash
pnpm lint                         # oxlint — no new warnings
pnpm format                       # oxfmt — no style violations
pnpm build                        # tsgo — compiles cleanly
pnpm test                         # vitest — all ~340 tests pass
pnpm build:tsc                    # tsc — type-check fallback (optional but recommended)
```
