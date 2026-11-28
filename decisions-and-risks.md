# Decisions and Risks

Working log for the architectural-hardening pass. Everything here is a claim
with a verification command or a pointer to the test/spec that backs it.

## 0. Live-system map (ranked by user impact)

This is a Node CLI, not a web app: there are no HTTP handlers, persisted status
columns, or client UI state machines. The equivalent surfaces are:

1. **Live, primary:** `run:<scenario>` / `run:all` / `run:default` →
   `generate()` → pipeline (voice runs) or `runVideoScenario()` (dry-run and
   no-narration runs); Playwright runner; auth/session capture; TTS providers
   (Piper, Chatterbox, OpenAI, ElevenLabs); FFmpeg mix/trim; narration sync.
2. **Live, secondary:** `init`, `script *` (generate/voice/build/validate/fix),
   `track`.
3. **Persisted state:** auth session JSON, narration manifest + clips, content
   hashed voice cache, temp video/cover files. No database, no rows, no
   cross-process status transitions.
4. **Concurrency/recovery hotspots:** `BrowserPool` session lifecycle,
   SIGINT/SIGTERM teardown, persistent Chatterbox worker request map, FFmpeg
   child processes, timestamp-named temp files.
5. **Test/CI:** 79 files, ~28s wall clock with Chromium installed; no real
   sleeps in unit tests; no sharding needed at this size.

The highest-impact entropy was therefore: the narration scene-index bug, the
pipeline/legacy cleanup split, the worker shutdown hang, and the two copies of
step-duration estimation — all addressed below.

## 1. Confirmed bugs fixed

| Bug                                                                             | Root cause                                                                                                                          | Regression evidence                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scenes without narration got corrupt `stepIndex` values after narration padding | `NarrationSyncStage` indexed every config scene into the windows-only array (`injectPadding` returned one entry per narrated clip). | `test/stages-sync.test.ts` — "remaps scenes without narration when padding inserts steps" asserts `[0,1,4,6]`. The old windows-only array is `[1,4]`, which the stage indexed by scene → `[1,4,undefined,undefined]` (verified by printing `injectPadding().sceneStepIndices` for the fixture). |
| Ctrl-C during a narration run left the browser running                          | Cleanup was wired only through the legacy `setOnBrowserCreated` hook, which `BrowserPool.acquire` never calls.                      | `test/browser-pool.test.ts` (one cleanup target per session, removed on release/releaseAll), `test/process-cleanup.test.ts` (late registration while draining runs immediately).                                                                                                                |
| Shutting down the Chatterbox worker mid-request hung callers                    | `shutdownChatterbox()` killed the process without settling `worker.pending`.                                                        | `test/voice-chatterbox-protocol.test.ts` — "rejects pending requests when the worker is shut down mid-flight".                                                                                                                                                                                  |
| Voice CLI runs wrote somewhere different from non-voice runs                    | `generate()` recomputed `outputPath` from cwd instead of accepting the path `loadConfig` resolved from the config file.             | `test/cli.test.ts` asserts `generate` receives `outputPath: "/tmp/output/demo.webm"`.                                                                                                                                                                                                           |
| Help advertised `0.7.7` forever                                                 | Hard-coded `cliDef.meta.version`.                                                                                                   | `test/cli.test.ts` — "reports the package version in help".                                                                                                                                                                                                                                     |

## 2. Pure structural / DRY cleanups (behaviour-preserving)

- `src/step-duration.ts` is the single implementation of step-duration
  estimation; `script/timing.ts` and `narration-sync.ts` both import it. The
  old source-regex drift test was replaced by a direct table assertion.
- `src/narration-plan.ts` owns the “generate narration?” predicate used by
  `TTSStage` and the CLI.
- `src/narration-placement.ts` is the pure core for video-time mapping,
  placement sorting and overlap resolution. `processVideoWithAudio` is now a
  thin I/O shell around it.
- `src/narration-sync.ts` exposes insertion-aware scene remapping
  (`PaddingAdjustment`, `adjustedSceneStepIndices`) instead of overloading the
  window list as a scene list.
- `src/process-cleanup.ts` + `src/browser/cleanup.ts` are the single lifecycle
  owner for process-interrupt teardown; the legacy module-global browser hook
  is gone.
- `SceneTracker` in `src/runner/scene-tracking.ts` is now the one owner of
  scene open/close bookkeeping; `runDemo` and the pure
  `buildSceneTimestamps` helper both use it instead of mirroring the rules.
- Temp audio paths (`probe-*`, `convert-*`, `seg-*`, `silence-*`, Chatterbox
  wavs) carry a PID/UUID suffix, so two generations in the same millisecond
  cannot overwrite each other.
- `runCleanupTargets` drains in a loop, so a target registered while the drain
  is in flight (a launch that resolved during the interrupt) is awaited rather
  than orphaned by the following `process.exit`.
- `closeSession` is single-flight; a stage `finally` and a signal drain racing
  to close the same browser share one close, and a genuinely failed close
  clears the promise so `releaseAll` can retry.
- `BrowserPool.acquire` closes and refuses a browser whose launch resolved
  after shutdown began.
- `planVideoTime` takes an explicit `measurementFailed` flag, so a probe that
  rejects with `undefined` still emits the “Could not measure…” warning.
- `src/commands/run/scenario-list.ts` holds the shared `run:all` /
  `run:default` tag-filter and execution loop.
- Removed every `any` in `src/`; dynamic optional-peer boundaries (`openai`,
  `ffmpeg-static`) now use `unknown` plus explicit local interfaces.
- Added `fast-check` property tests for overlap resolution, placement,
  video-time planning and padding/scene remapping.

## 3. Formal verification

- `formal/ChatterboxWorker.tla` models submission, replies, worker death and
  shutdown of the persistent Python worker.
- `formal/ChatterboxWorker_Fixed.cfg` passes: 874 generated / 210 distinct
  states, no invariant violation.
- `formal/ChatterboxWorker_BuggyCleanExit.cfg` reproduces the historical
  “clean exit mid-request leaves pending callers” bug and **must fail**. TLC
  exits 12 with `NoDeadWorkerWithPending` violated; `scripts/check-formal.sh`
  asserts the failure is for that invariant, not a parse error.
- Narrowing assumption (documented in the spec): request ids are unique and
  never reused. Production increments one counter, so a stale reply cannot be
  routed to a newer request.
- The model deliberately excludes stdout chunk framing (covered by protocol
  tests) and the process-exit hook (covered by cleanup tests).
- `tla2tools.jar` is pinned by SHA256
  `df7cef5d37bcca879817424c001696e07fd094d68a72690449af3045fd972469`
  (v1.8.0).

### Why not Lean 4 here

The finite tables in this repo are the discriminated step union and the
duration table. The step union is already compiler-checked for exhaustiveness,
and the duration table is small enough that `decide` would only restate the
TypeScript cases with no independent production export. Lean was skipped
rather than adding a disconnected toy model; `fast-check` covers the algebraic
properties over the real functions. This is a scope decision, not a claim that
Lean would be wrong for a persisted status/eligibility matrix later.

## 4. Deferred / needs human sign-off

### Dual execution engines (highest remaining entropy)

Two engines are still live:

- `generate()` → `runPipeline()` is used for voice/narration runs, programmatic
  callers, and `--silent`.
- `runVideoScenario()` in `video-handler.ts` is used for CLI `--dry-run` and
  for runs without generated narration.

They duplicate auth/pre-steps/recording/post-steps orchestration. Converging
on the pipeline would delete ~220 lines, but the deltas are product-visible:

| Area                    | Legacy (`runVideoScenario`)               | Pipeline                                                       |
| ----------------------- | ----------------------------------------- | -------------------------------------------------------------- |
| CLI `--dry-run`         | Strips delays, narration sync off, no TTS | Runs TTS + sync on purpose so a dry run predicts narration fit |
| `video.span` trimming   | Ignored                                   | Honoured (pre-roll/tail trimmed)                               |
| Post-steps on failure   | Runs as cleanup                           | Not run after a pipeline throw                                 |
| Subtitle/metadata clock | Step clock                                | Rescaled video clock                                           |
| Log line                | Includes duration                         | `✓ Video created → path`                                       |

Recommendation: route CLI non-dry runs through `generate({ outputPath })`
first (preserving the output-path fix above), then decide separately whether
`--dry-run` should keep its cheap path or adopt pipeline semantics. That
requires product sign-off; it was not changed here.

### Other deferred items

- Legacy cookie helpers in `src/auth.ts` (`loadCookies`, `saveCookies`,
  `isAuthenticated`, `clearCookies`, `CookieAuth`) have tests but no product
  callers. Deleting them is safe-ish but touches test fixtures; left for a
  dedicated cleanup.
- `config.concurrency` exists in the schema but no command runs scenarios in
  parallel. Implementing it would turn the now-single scenario loop into a
  concurrency owner (with a bounded pool), so it should be a separate design.
- `scripts/check-model-sync.mjs` skips when the base ref is unavailable (local
  runs without `origin/main`); CI always supplies it. The PR workflow change
  itself is high-risk per repository policy and needs human review.
- TLC is cached in CI (`.tla`, keyed by jar version + SHA) and pinned by the
  `actions/cache` commit SHA as well.

## 4b. Independent review outcome

A cold read-only `oracle` review of the narration/lifecycle/placement diff
reported three concrete issues, all fixed and re-tested before this log was
finalised:

1. Late cleanup targets were fire-and-forget, so `process.exit` could beat a
   browser that resolved during the drain. `runCleanupTargets` now loops until
   no target remains.
2. A signal drain and a stage `finally` could close the same session twice
   (rewriting `recordingEndedAt` and re-closing page/context/browser).
   `closeSession` is now single-flight and retryable on failure.
3. A probe rejection carrying `undefined` lost the “Could not measure…”
   warning. `planVideoTime` now takes an explicit `measurementFailed` flag.

The review's second pass over the CLI/formal/CI areas did not return within the
run budget; those areas were verified directly instead (YAML parse, TLC fixed +
buggy runs, local model-sync, targeted tests). Treat the CI workflow change as
still needing human review.

## 5. Verification (exact commands)

Run on 2026-11-28 in this worktree, after installing Chromium for the
real-browser suites (`pnpm exec playwright install chromium`).

| Command                                   | Result                                                                              |
| ----------------------------------------- | ----------------------------------------------------------------------------------- |
| `pnpm run format:ci`                      | pass — 224 files                                                                    |
| `pnpm run lint:ci`                        | pass — exit 0                                                                       |
| `node scripts/check-architecture.mjs`     | pass — 90 source files                                                              |
| `pnpm test`                               | pass — 79 files, 1082 tests, 28.5s                                                  |
| `pnpm build` (`tsgo`)                     | pass — exit 0                                                                       |
| `pnpm exec tsc --noEmit -p tsconfig.json` | pass — exit 0                                                                       |
| `bash scripts/check-formal.sh`            | pass — fixed model 210 distinct states; buggy model fails `NoDeadWorkerWithPending` |
| `node scripts/check-model-sync.mjs`       | pass locally (base unavailable → documented skip)                                   |

Test-count delta: 1061 collected before this pass (32 browser tests failing
because Chromium was absent); 1082 pass now, including 7 property cases, 4
cleanup cases, the narration-plan cases and the narration regression.
