# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.14.0] - 2026-08-30

- **`cover` captures a deterministic PNG beside the video.** Place one `cover` action in the recorded demo flow to wait for a meaningful ready locator, optionally wait for the page to settle, and capture the browser state with animations disabled and the caret hidden. The image uses the video’s basename with a `.png` extension, while dry runs still validate the locator without writing an image. Cover actions are rejected in setup/auth/cleanup steps, and configs may contain at most one.

## [0.13.0] - 2026-08-28

### Added

- **`video.zoom` turns the recorder into a virtual camera: the frame eases to a zoom percentage, follows the synthetic pointer while it moves, and eases back out.** Screen-recording tools sell this framing because it is where attention already is — but browser automation cannot crop after the fact without knowing where the viewer will look, and it cannot know that better than the runner does, seconds _before_ each click lands. So the camera lives in the page during recording rather than in ffmpeg afterwards: CSS `zoom` on the root (browser-zoom semantics — layout reflows like a real pinch-zoom, text stays vector-crisp, and Playwright clicks resolve against live layout so every interaction still lands exactly where it aimed), panning via real scrolling, and engagement anchored on the element the next step is about to touch. Follow-the-mouse is a dead-zone box with eased catch-up rather than hard centring, because the bezier pointer wobbles continuously and a frame locked to it never rests; the anchor holds at rest and the dead zone takes over in flight. Back-to-back actions on the same element chain into one continuous shot instead of bouncing per step. Three design points are load-bearing. First, everything that decides motion is pure arithmetic (`camera-math.ts`) embedded into the injected script _by source_ — one implementation shared by tests and runtime, which caught a serialised helper reaching for a module-scope closure the page had never seen. Second, the page side measures rather than assumes: ground truth about how CDP input, CSS zoom and scroll units interact is pinned by a dedicated real-browser suite (`test/camera.browser.test.ts` — clicks at every viewport corner land correctly at 1.5×/2×, scroll units stay visual pixels, the cursor overlay compensates by the live zoom factor, clearing zoom restores geometry exactly), so a Chromium update that shifts that ground fails loudly here before it fails silently for a user. Third, camera animation spends real wall-clock time inside steps, and that is safe without touching timing code: scene timestamps and narration placement reconcile against measured recording time, and the planned GIF export will inherit the baked-in framing for free. Configuration layers `video.zoom` ← `scenes[i].zoom` ← step parameters through one merge; `{ action: "zoom" }` steps are author-directed camera work that runs under every mode, with `direction: "out"` returning to the pre-engagement framing. Auto mode covers click/hover/type/fill/press/select/check/drag and deliberately never `scroll`, whose whole point is to show more than one screenful.

## [0.12.0] - 2026-08-15

### Added

- **`video.span` decides which part of the browser session becomes the video.** Recording starts when the browser context is created, which is before the first scene exists: with `auth` configured the session restore navigates and the app boots inside the recording, and teardown runs after the last scene. That footage was always captured and nothing could reach it, because it happens outside the scenes entirely — one real app opened every video on 3.9 seconds of blank page. `"scenes"`, the new default, trims to the span the scenes occupy; `"session"` keeps the whole recording and is the pre-0.12 behaviour. It is deliberately a policy and not a duration: the pre-roll is an app cold start and is not stable, ranging from 3.7s to 9.5s over 15 consecutive runs of the same app, so no number written in a config could be right twice. The pipeline measures it per run instead. The cut rides along with the audio mix as an input seek, since that pass already re-encodes, and it has to happen there rather than afterwards or it would remove the narration just placed. A stream copy is not an option — Playwright's webm carries very few keyframes, two in a 6.9s capture, so the cut would land seconds from where it was asked for. Runs with no audio would otherwise copy the recording through untouched, so those get their own trim pass rather than silently ignoring the setting.

### Fixed

- **Narration was placed by stretching the timeline rather than offsetting it, so every video was mistimed at the front.** Scene timestamps come off the step clock, which starts at zero with the first scene; the recording started earlier and stopped later. The two clocks share a unit but not an origin, and `processVideoWithAudio` reconciled them with `recordedMs / stepClockMs` — modelling a constant head offset as a uniform stretch. Measured against encoded output the video timeline tracks wall clock to well under a percent, so the true scale is ~1.0; a real recording with a 3.9s pre-roll and a 0.8s tail over an 88s demo produced 1.053, putting the opening line seconds ahead of the thing it described and converging to correct only at the very end. The launcher now stamps when the recording starts and stops, the recording stage stamps the scenes, and cues are placed at `preRoll + sceneStart`. What is left over became a real scale check that warns when the recorded scene span does not match the step clock — a condition the fudge factor had been absorbing silently. Subtitles and metadata go through the same mapping, so visual times are positions in the file rather than on the step clock, and the three can no longer disagree about where a scene is. Without a timeline the old whole-recording ratio still applies, since it remains the best guess available.
- **`localStorage` was never restored, on any run, for anyone who asked for it.** `restoreLocalStorage` ran `page.evaluate` against whatever page it was handed, and at the only moment it is ever called — `restoreSession`, before `handleAuth` navigates — that page is still on `about:blank`. The lookup was therefore `storageData[new URL("about:blank").hostname]`, i.e. `storageData[""]`, which is never a key any capture writes. It did nothing and returned successfully. The `track` command had the same latent bug, restoring before its own `goto`. Restoration is now a context-level init script, which additionally lands the values before the target origin's first script runs — the property that actually matters, since an app reading storage while it bootstraps is exactly the kind that needs its session back. A `sessionStorage` sentinel stops the snapshot being re-applied on later navigations, which would revert a token the app refreshed mid-run to the stale one it started with, and pages already on a matching origin are still written to directly so restoring after a navigation keeps working.

Eight further defects, every one of them found by writing a test for code that had none. They are grouped here because they share a cause rather than a symptom: the areas of the codebase that decide how a video actually turns out — cursor motion, narration timing, the TTS worker protocol, the browser session lifecycle — sat between 6% and 33% statement coverage, and each of these bugs survived precisely because nothing exercised the line it lived on.

- **`generate({ silent: true })` threw outright for any config with audio.** Silent mode strips narration and forces `outputFormat: "webm"`, but left `config.audio` in place — and the schema refuses webm whenever `audio.narration` or `audio.background` is set. So the one option whose entire purpose is "give me the video without the voice" failed validation before it did anything, for every user who had background music configured. `audio` is now dropped alongside `voice`. Separately, when no `outputPath` was given the default filename was hardcoded to `.mp4` regardless of format, so a silent run that got past validation wrote a webm payload under an mp4 extension; the extension now follows `outputFormat`.
- **Piper's binary auto-download 404'd on every Mac.** The release asset name was built by interpolating `process.platform` directly, yielding `piper_darwin_aarch64.tar.gz` — but the rhasspy release publishes `piper_macos_aarch64.tar.gz`. The same construction produced `piper_windows_aarch64.zip` for Windows on ARM, which does not exist either; that platform runs the x64 build under emulation, so it now resolves to `piper_windows_amd64.zip`. The failure was invisible to anyone developing on Linux, and on macOS it degraded quietly rather than loudly: `findPiperBinary` catches the download error and falls through to `which piper`, so the only signal was that the bundled binary silently never worked and users were always on a system install. The mapping is now covered per platform/arch rather than only on whichever machine happens to run the suite.
- **Two ways the Chatterbox worker could hang the CLI forever.** Pending requests were failed only when the Python worker exited with a _non-zero_ code, so a worker that shut itself down cleanly mid-request left the caller awaiting a reply that could never arrive — no timeout exists anywhere in the synthesis path, so this is an indefinite hang, not a slow failure. The second is narrower and worse: when the worker cannot parse a request it replies `{"ok": false, "error": ...}` with **no `id`**, and the reader discarded any frame without one. Both now settle the in-flight requests with the worker's own error message.
- **A drag step could report success having dragged nothing.** When the source or target element handle could not be resolved, `runStep` skipped the drag events but still ran `mouse.down()` — and never the matching `up()`. The step passed, the demo continued with the mouse button held, and every subsequent interaction misbehaved. It now throws, which is what the simple runner already did for the identical condition; the two runners no longer disagree about what a broken drag means.
- **`extractPage` threw `ReferenceError` on every real run.** The two `page.evaluate` callbacks called `filterHeadings` and `processElements` — module-scope Node functions that do not exist inside the browser realm the callback is serialised into. The callbacks now return plain serialisable DOM data and the filtering runs in Node. Worth recording why this lasted: the existing tests stubbed `page.evaluate` by stringifying the callback and then invoking the Node implementation, so they asserted the exact arrangement that could not work. A real-Chromium test now covers it, and a unit test asserts the callbacks reference no Node-scope helpers.
- **Narration padding no longer rewrites the config it was given.** `injectPadding` took a shallow copy of the steps array and then mutated the step objects inside it — which are the caller's. The returned array and the input were the same objects, so the "original" steps came back already padded and any recomputation from them saw a deficit of zero.
- **A browser could be left running and untracked when its close failed.** `BrowserPool.release` removed the session from its list _before_ calling `closeSession`, which throws for real (`"No video was recorded"`). On that path the browser was both still alive and no longer reachable by `releaseAll`, so the cleanup in `generate()`'s `finally` could not reap it. The session is now dropped only once the close has settled.
- **`fill` steps logged as `unknown-step`.** `formatStepForLog` had no branch for a step type both runners fully support, so verbose output was useless for exactly the steps most likely to need debugging.

### Changed

- **The test suite went from 689 to 966 tests, and coverage from 75.2% to 85.8% of statements (72.4% to 81.6% of branches).** The suite stands at 1001 after the timing and storage fixes above. The aim was not the percentage: tests were written for behaviour that could actually break — the exact-sum invariant on eased scroll deltas, code-point iteration when typing emoji, the inverse `speed` → `length_scale` relationship for Piper, the recorded-to-step-clock rescale that decides whether narration drifts out of sync on a long demo, and the JSON-lines framing of the Chatterbox protocol against a fake child process that splits messages across chunk boundaries. `BrowserPool` went from 0% to fully covered, the Chatterbox client from 6% to 94%. Two files are now excluded from coverage rather than padded with hollow tests: `src/voice/openai.ts` is thin SDK glue, and `src/script/explore.ts`'s `main()` is a single-app crawl driver. Note that `src/runner/cursor.ts` still reports ~22% despite being well covered — its script executes inside the page, where Node's v8 instrumentation cannot observe it.
- **Cursor overlay, drag semantics and narration placement are now verified against real Chromium and real ffmpeg.** Mocked pages cannot run a `page.evaluate` callback, so the cursor's hotspot offset, viewport clamping and `localStorage` persistence (including recovery from corrupt stored state) had no meaningful coverage at all. The same applies to the drag sequence: `dragstart → dragover → drop → dragend` sharing a single `DataTransfer` is what real drop-zone libraries key off, and it is only observable in a browser. On the audio side, a test now confirms that a narration clip asked for at a rescaled offset is genuinely audible there in the encoded file and silent immediately before it — a filtergraph that ignored the offset, or applied it in seconds instead of milliseconds, would satisfy every argument-string assertion and still ship an unusable video.
- **The auth tests no longer touch the network.** They made nine live requests to `example.com`, which had already forced their timeouts up to 30s, and a cookie test had been skipped outright since it depended on `httpbin.org` returning 503s in CI — leaving `captureCookies` with no coverage. `example.com` is now served by a route interceptor, so every URL and cookie domain is unchanged while nothing leaves the machine; the whole file passes with networking disabled entirely. The cookie test is un-skipped using `addCookies`, and the session fixture directory moved from a fixed path inside the repo to `mkdtemp`, which was unsafe under concurrent runs and left debris behind when a run was killed.

### Known issues

- **`timing.maxSyncPasses` and `auth.behavior.autoReauth` are accepted but do nothing.** Both are defined in the schema, carried through the presets and plumbed into the code that should read them — and neither is ever read. Narration sync runs exactly one pass regardless of `maxSyncPasses`, and `autoReauth` sits in the default behaviour object unused. They are documented here rather than silently removed because deciding between implementing them and dropping them from the schema is a compatibility question, not a bug fix.
- **`timing.afterGotoDelayMs` applies only to the first navigation.** The flag that tracks whether the delay has run latches for the whole demo, so a scenario with a second `goto` gets no settle delay after it, despite the field being documented as "wait time after navigation". Current behaviour is pinned by a test; whether the name or the latching is wrong is a design decision left open.

## [0.11.0] - 2026-08-08

### Security

- **Two high-severity advisories in transitive dependencies are closed.** `brace-expansion` ([GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895), denial of service via unbounded intermediate arrays) reached the published package through `glob` → `minimatch` and moves to 5.0.9. `nanoid` ([GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8), infinite loop when size is zero) was development-only, through `vitest` → `vite` → `postcss`, and moves to 3.3.18. The second needed an entry in `pnpm-workspace.yaml` `overrides` rather than a plain update: `postcss` already allowed the fixed version, but pnpm will not bump a dependency that appears in no manifest, so the lockfile would have kept resolving the vulnerable one indefinitely. That pin can be dropped once `postcss` raises its own floor.

### Changed

- **Dependencies updated to latest, including TypeScript 6 → 7.** Both build paths were checked rather than just the default one, since `make verify` only exercises `tsgo` and a compiler major is precisely where the documented `tsc` fallback would rot unnoticed; both compile clean on 7.0.2. `vite` remains pinned at 8.0.16 through the existing override.

## [0.10.1] - 2026-07-28

### Fixed

- **`generate()` no longer hangs forever when Chatterbox is the voice provider.** The persistent worker is a child process holding three stdio pipes, and open handles keep Node's event loop alive — so its only cleanup, registered through `process.once("exit")`, could never run: the exit event it waited for was the one its own handles were preventing. The CLI hid this behind an explicit `process.exit()`, so the bug was invisible to anyone driving demo-reel from the terminal and total for anyone calling `generate()` from their own script, where the promise resolved, the video finished, and the process simply never returned. The worker is now reaped in `generate()`'s `finally` block next to the browser pool release, which runs on the success and failure paths alike.
- **Chatterbox's trailing audio artifact is trimmed away.** The model intermittently appends a burst of non-speech audio once the narration has finished — garbled noise dropped into the middle of a demo video where silence belongs. It is not rare: rendering one line ten times at default settings put a tail on 6 of them, median 0.82s, worst 1.36s at 29% of the file, and loud, the worst only 18dB below the speech peak. No parameter suppresses it. This is a known upstream bug ([resemble-ai/chatterbox#271](https://github.com/resemble-ai/chatterbox/issues/271), open and unanswered) whose reporter found temperature made no difference, and the model's own `forcing EOS token` guard fired on 9 of those 10 renders — including all four that came out clean — so its runaway detection does not even predict the outcome. Nothing can be tuned away at a 50-60% random failure rate. What makes it fixable is that the artifact is always separated from the speech by real silence: the worker now finds the last silent gap of at least 0.30s (below -50dB relative to peak) and drops whatever follows, keeping 0.15s of silence so the cut is not abrupt. Over-trimming is guarded by length — a genuine closing phrase after a dramatic pause is comparable to the speech before it, while a hallucinated tail is short, so the cut only lands when the trailing burst is the smaller of the two. Verified against those ten renders: six tails removed with every cut falling after the speech ended, four clean renders untouched, no speech clipped. Set `CHATTERBOX_TRIM=0` to keep the raw output.

## [0.10.0] - 2026-07-28

### Added

- **`chatterbox`: a local voice that no longer sounds synthetic.** Piper is fast and tiny, but its prosody flattens out over anything longer than a sentence — the pitch contour resets per clause, so a three-sentence scene reads as three unrelated fragments and the narration draws attention to itself instead of the product. Resemble AI's Chatterbox Turbo (MIT) is a different class of model: it carries intonation across sentence boundaries and is preferred over ElevenLabs in the vendor's blind listening tests. It also does zero-shot voice cloning — point `voicePath` at a 7-15s reference clip and every demo you ever generate shares one brand voice, which Piper's fixed model set cannot do at all. The cost is real and worth stating plainly: ~3x slower than realtime on CPU where Piper runs 8x faster than realtime, so a 3-minute narration takes ~9 minutes rather than ~20 seconds. That is a one-time cost per line, since the existing content-hash cache means editing one sentence re-synthesises only that sentence. It needs a Python environment (documented in the README) and a multi-GB model download, and output carries an inaudible Resemble watermark. Piper stays the default for exactly those reasons — a 4GB first run is a poor first impression for someone who just installed the package — so this is opt-in per demo.
- **`chatterbox-multilingual`: the same voice quality in 23 languages.** Turbo is English-only, which left every non-English demo on Piper. The multilingual checkpoint covers `ar da de el en es fi fr he hi it ja ko ms nl no pl pt ru sv sw tr zh` at essentially the same speed (measured 3.46x realtime versus Turbo's 3.03x), so the broader coverage costs nothing but disk. It is deliberately a **separate provider** rather than a `language` field on `chatterbox`: these are two different checkpoints with different sampling defaults, and folding them together would mean `language: "en"` and omitting it silently produce different audio from the same config. `language` is required here and validated against the supported set, so a typo fails at config time instead of surfacing as mispronounced narration. Cached audio is keyed on the language too, so switching regenerates rather than serving the previous language's clips.

### Changed

- **Voice cache keys now include the language, without invalidating anything.** `cacheKey()` hashes the language segment only when the config actually has one, so keys for `piper`, `chatterbox`, `openai` and `elevenlabs` remain byte-identical to those written before this release and existing cached narration is reused untouched. `test/voice-cache.test.ts` pins this against a hand-computed pre-change hash, so a future refactor that quietly changes the key format fails the suite rather than silently re-synthesising every demo in the wild.

## [0.9.5] - 2026-07-28

### Fixed

- **Invalidating a session now clears the browser, not just the file.** A stored session carries cookies for the identity provider as well as the app, and the two expire independently. When the app's session died first, `clearSession` unlinked the file but left a live IdP cookie in the browser — so the login steps clicked through to the IdP, which completed silently via SSO instead of rendering its form, and the run timed out waiting for a login field that would never appear. Intermittent by nature, since it depends which session expires first. `clearBrowserSession` now drops the context's cookies (and best-effort page storage) whenever an invalid session is cleared, so a re-login starts clean.
- **Session state is written inside the project again.** `handleAuth` took `dirname()` of its config path unconditionally, but `generate()` passes the working _directory_ rather than a config file — so `.demo-reel-sessions` was created one level ABOVE the project, next to it rather than in it, where it is not gitignored and contains live auth cookies. `resolveSessionBaseDir` now uses the path itself when it is a directory and its parent when it is a file, so both the CLI and `generate()` land in the right place.

## [0.9.4] - 2026-07-27

### Fixed

- **Narration no longer drifts ahead of the picture.** Scene timestamps come off the _step clock_ — elapsed time measured while driving the page — but the recorded video is not that long. The browser records on wall-clock at a fixed frame rate and runs a few percent longer under recording load. Narration was placed at raw step-clock offsets against that longer video, so every clip landed progressively early: on a 63s demo the recording measured 65.5s, a 3.7% stretch, which by the closing scenes put lines seconds ahead of the actions they describe. The symptom is nasty because each scene looks individually plausible — only the accumulation gives it away, and it reads as "the narration doesn't match the video" rather than as a timing bug. `processVideoWithAudio` now measures the recording with ffprobe and rescales scene starts onto it; the two clocks share an origin, so one ratio corrects the whole timeline. Drift over 250ms is reported. If the probe fails, placement falls back to the step clock and says so.

## [0.9.3] - 2026-07-27

### Added

- **`fill` step: set an input's value directly, without keystrokes.** `type` clicks the element and then types character by character, which cannot set a segmented native input at all. A `<input type="date">` renders as `mm/dd/yyyy`, the click lands on whichever segment sits under the pointer — the centre, so usually not the first — and typed digits fill only that segment. The result is a half-entered date the form rejects, with no step failure, because typing characters into a field is all `type` verifies. Verified against a real date input: `focus()` or a click on the field's left edge then typing works, a centre click then typing does not, at any keystroke delay. `fill` moves the cursor to the field so the interaction still reads naturally on camera, then commits via `fill()`. Use it for `date`, `time` and `color` inputs; keep `type` where the typing animation is the point.

## [0.9.2] - 2026-07-27

### Fixed

- **Narration cache now invalidates when the narration changes.** `shouldRegenerateNarrationArtifacts` only checked that the audio and manifest files existed and that `processingVersion` matched — never what the audio was generated from. Since the manifest maps clips onto scene _indices_, editing the scene list left a cache describing a config that no longer existed. Reusing it attached narration to the wrong scenes, or crashed narration sync outright when the manifest named more scenes than remained. The manifest now carries an `inputsHash` over the narrated scenes (index, step index, text) and the resolved voice, and is only reused while that still matches. Manifests written before this field are treated as a miss and regenerate once.
- **A stale manifest now explains itself.** `buildSceneWindows` guarded the current clip's scene but dereferenced the _next_ clip's without checking, so the failure surfaced as `TypeError: Cannot read properties of undefined (reading 'stepIndex')` from inside demo-reel, with nothing pointing at the cache. All referenced scenes are validated up front and the error names both the mismatch and the `--no-cache` way out.

## [0.9.1] - 2026-07-27

### Added

- **`DEMO_REEL_EXECUTABLE_PATH` selects the recording browser**: set it to a browser installed on the host (Brave, Chrome) and both launchers use it instead of the bundled Chromium. Needed when a page depends on a proprietary component the open-source build omits — most often PDFium: bundled Chromium renders "PDF preview is not supported in this browser" where Brave or Chrome shows the document, making any demo of an embedded PDF preview unrecordable. Ignored when unset or empty, so the default is unchanged.

### Fixed

- **Login validation no longer waits for `networkidle`**: `validateSession` now navigates with `domcontentloaded`. An app that polls — long-poll, websocket heartbeat, periodic refresh — never goes network-idle, so validation timed out and reported "Login failed: could not find success indicator" for a session that was in fact valid. Nothing there needed a settled network: the success indicator is awaited explicitly afterwards, and that is the real signal.

Both of the above previously had to be carried downstream as pnpm `patches/` entries, which break on every version bump because a pnpm patch is pinned to an exact version.

## [0.9.0] - 2026-07-27

### Fixed

- **Narration sync is wired into the pipeline again**: `NarrationSyncStage` was defined but never instantiated — it was dropped from the stage list in the 6-phase refactor (#59) and nothing failed, because the pipeline still ran and still produced video. Scenes were simply never padded to cover their narration, and `maxAutoPadMs` / `maxSyncPasses` silently became no-ops read only by unreachable code. The stage now runs between TTS and Recording, where it can see the clip durations TTS writes and rewrite the step delays Recording plays back. **Videos with narration longer than their visual will get longer**: a scene is now extended to fit its voiceover instead of the voiceover being pushed into the following scene by the post-recording auto-shift. Two real slate segments were being cut off mid-sentence by 6.3s and 4.7s respectively.
- **Narration overflow is reported**: a scene needing more than `maxAutoPadMs` of padding now pushes a warning that is always printed, rather than being visible only under `--verbose`. `maxAutoPadMs` is a warning threshold, not a cap — padding always closes the full deficit.

### Changed

- **`--dry-run` now generates narration**: `TTSStage` no longer returns early on a dry run. Narration is what decides scene padding, so a dry run that skipped it could not predict whether the voiceover fits — and `strict` mode would pass in a dry run and throw in the real one. Voice clips are cached by content hash, so a dry run pays for TTS once per narration edit and the real run that follows reuses the same audio. **Dry runs now need the TTS provider available** (for the default Piper, the binary and voice auto-download on first use). This supersedes the 0.8.2 claim that a dry run "cannot structurally diverge" from a real run: it could, for narration timing, and now it does not.

### Added

- **`buildStages()` is exported** from the package entry point, so the pipeline's stage ordering can be asserted in tests. Added as a regression guard for the class of bug above, where a stage silently leaves the pipeline and nothing fails loudly.

## [0.8.4] - 2026-06-18

### Changed

- **`select` action is now cursor-driven**: the `select` action moves the cursor to the element and clicks it before committing the value, so the interaction reads as a deliberate user action instead of the value teleporting in. A native `<select>`'s option list is an OS popup outside the DOM (unreachable by the overlay cursor or coordinate clicks), so the value itself is still committed via `selectOption` — no config changes are required.

### Fixed

- **Cursor renders above modal dialogs**: the cursor overlay is now promoted into the browser top layer via the Popover API, so it paints above native modal dialogs (`showModal()`) and popovers, which sit above any `z-index`. It re-promotes itself above dialogs/popovers that open after it. Previously the cursor was a high-`z-index` element that the top layer always covered, so it appeared behind (and blurred by) any open dialog. Degrades gracefully to the old z-index element where the Popover API is unavailable.

## [0.8.3] - 2026-06-18

### Fixed

- **Cursor motion duration is now faithful**: `moveMouseBezier` drives the easing curve by elapsed wall-clock time against `moveDurationMs` instead of a fixed step count. Each `page.mouse.move()` costs ~15-25ms (a CDP round-trip) that the old fixed-step model ignored — it only budgeted the per-step `waitForTimeout` — so real move time ran ~1.7-3x past `moveDurationMs`, scaling with travel distance and worse under recording load. This desynced recordings from dry-run timing, most visibly on dialog-heavy scenes with long cursor travel. The frame count now adapts to machine/recording load while total duration stays ~`moveDurationMs`.
- **`upload` works on hidden file inputs**: the `upload` action now waits for the target to be `attached` rather than `visible`. File inputs are conventionally hidden behind a styled dropzone and `setInputFiles` works on hidden elements, so requiring visibility made uploads time out.

## [0.8.2] - 2026-06-16

### Fixed

- **Pre-steps now authenticate**: `PreStepsStage` restores the session before running pre-steps, matching the recording and post-steps stages. Previously pre-steps ran in a fresh, unauthenticated browser, so any step touching a protected page silently failed (pre-steps run in `tolerant` mode) — leaving setup work like template creation undone and causing the demo's scenes to fail later on a blank page.

### Changed

- **`--dry-run` now uses the same pipeline as a real run**: removed the separate legacy `runVideoScenario` dry-run path. A dry run is now the real pipeline with the production stages (TTS, recording capture, audio mix, output) skipped, so it exercises the exact same auth, pre-steps, and scene steps a real run does — at real timing, in a non-recording browser, producing no video. A passing dry run is now a faithful predictor of a passing real run and cannot structurally diverge from it; the only thing it can't reproduce is recording-induced CPU-timing flakiness.

## [0.8.1] - 2026-05-30

### Fixed

- **Dry-run preSteps tolerance**: `runVideoScenario` dry-run path now runs `preSteps` with `tolerant: true`, matching the normal recording path. Previously, demos with `resetTemplateSteps` (which attempt to delete a potentially non-existent template) would crash in `--dry-run` mode but succeed during actual recording.

## [0.8.0] - 2026-05-29

### Changed

- **Unified FFmpeg wrapper**: merged duplicate `getFfmpegPath`/`runFFmpeg`/`runFfprobe` implementations from `audio-processor.ts` and `script/tts.ts` into a single `src/ffmpeg/utils.ts` module. Both original files now re-export from the shared module. No consumer API changes.
- **Split runner into submodules**: extracted 12 focused modules from `src/runner.ts` (1392 lines) into `src/runner/` (types, utils, selectors, cursor, typing, motion, assertions, step-simple, steps, scene-tracking, index). Original file is now a re-export barrel. All tests pass, no consumer API changes.
- **Extracted voice module**: split `src/script/tts.ts` (432 lines) into `src/voice/` (types, index, cache, piper, openai, elevenlabs). TTS provider interface, registry, providers, and caching live in the new module. `src/script/tts.ts` retains the high-level voice generation pipeline and re-exports everything for backward compatibility.
- **Extracted browser module**: moved browser lifecycle functions from `src/video-handler.ts` into `src/browser/` (types, launcher, pool). `startBrowser`, `startRecording`, and `stopRecording` are now thin wrappers delegating to the new module. Browser pool provides lifecycle management for multiple concurrent sessions.
- **Pipeline orchestrator + stages**: created `src/pipeline/` (types, context, orchestrator) and `src/stages/` (tts, sync, auth, pre-steps, recording, audio-mix, output, post-steps). `generate()` now composes stages via `runPipeline()` instead of inline orchestration. Eliminates the temp JSON serialization roundtrip. `runVideoScenario` remains as backward-compatible entry point.
- **Split schemas into sub-modules**: extracted 6 focused modules from `src/schemas.ts` (732 lines) into `src/schemas/` (primitives, selector, steps, config, scenes, transform). Original file is now a re-export barrel. All tests pass, no consumer API changes.
- **Citty CLI framework**: replaced the 55-line manual `showHelp()` with auto-generated help via [Citty](https://github.com/unjs/citty). Args are declared declaratively in a `defineCommand({})` block, driving `--help` output automatically. The existing `parseArgs()` and `runCli()` dispatch logic are unchanged, preserving backward compatibility.
- **Post-recording auto-shift**: replaced the estimate-based `NarrationSyncStage` with post-recording placement correction in `AudioMixStage`. Narration clips that overlap are automatically shifted forward based on real recorded timestamps. This eliminates the 836ms overlap warnings seen with fast network loads.
- **Removed `run()` API**: deleted the standalone `run()` entry point. The `--silent` flag has been ported to the CLI (`demo-reel --silent`) and flows through `generate()`. The old `demos/run-example.demo.ts` script that used `run()` has been removed.

### Fixed

- **Unknown flag detection**: the CLI now rejects unrecognized `--flags` (e.g. `--sry-run` typo of `--dry-run`) with a clear error message instead of silently ignoring them.
- **Missing narration audio**: `AudioMixStage` now validates that the narration audio file exists before invoking ffmpeg, surfacing a clear error when TTS generation failed instead of the cryptic "Error opening input file" from ffmpeg.
- **Audio path resolution**: fixed a bug where audio paths were resolved relative to the parent of `process.cwd()` instead of the project root, causing ffmpeg to look for narration files one directory level above where they were generated. `AudioMixStage` now passes absolute paths directly.
- **`--no-cache` wiring**: the `--no-cache` CLI flag was previously parsed but never used in the `generate()` pipeline. It now flows through `PipelineContext` to `TTSStage`, correctly bypassing voice cache and forcing regeneration.

### Added

- New dependency: `citty` for declarative CLI arg definitions and auto-generated help.
- `--silent` CLI flag: strips voice narration, forces webm output, and clears scene narrations.

## [0.7.7] - 2026-05-25

### Fixed

- **`--dry-run` cursor movement**: cursor now teleports instantly instead of stepping through bezier points when `moveDurationMs` is zero. Previously, even with instant presets, `stepsPerPx: 1` generated hundreds of mouse-move steps with a 1ms minimum delay each, adding hundreds of milliseconds per interaction.

## [0.7.6] - 2026-05-25

### Added

- **`run()` export**: lightweight entry point for `.demo.ts` scripts that automatically resolves CLI flags (`--dry-run`, `--verbose`, `--headed`, `--silent`) from `process.argv`. Replaces manual `process.argv.includes(...)` plumbing with a single call: `await run(config)`. The `--silent` flag strips voice narration, forces webm output, and clears scene narrations — useful for CI or local testing without TTS.

## [0.7.5] - 2026-05-25

### Added

- **`--dry-run` CLI flag**: execute all steps through a real browser at maximum speed — no video recording, TTS narration, subtitle generation, or audio processing. Forces instant timing presets and strips all `wait` steps and delay fields. Ideal for CI validation of demo scripts.
- **`waitFor` flag on interactive steps**: collapse the common `waitFor selector + action` pattern into a single step by setting `waitFor: true` on click, type, hover, scroll, select, check, upload, drag, press, assertText, assertVisible, and assertCount steps.

## [0.7.0] - 2026-05-23

### Added

- **Piper Auto-Download**: Piper binary and voice models are downloaded automatically on first use
  - Binary fetched from GitHub releases, cached in `~/.demo-reel/piper/`
  - Voice models fetched from HuggingFace when not found locally
  - No `pip install` or manual model downloads required
  - Supports all OS/arch combos (Linux x86_64/arm64/armv7l, macOS x64/arm64, Windows x64)
- **6 the-internet Demos**: Comprehensive demo suite using the-internet.herokuapp.com, the standard Playwright/Selenium test playground
  - `the-internet-login` — goto, type, click, hover
  - `the-internet-dynamic-controls` — waitFor, click, type (async UI changes)
  - `the-internet-checkboxes-dropdown` — check, select (form controls)
  - `the-internet-file-upload` — upload (file input)
  - `the-internet-hovers` — hover with index (hover reveals)
  - `the-internet-drag-drop` — drag (column swap)
  - All 12 step types covered across 6 demos, no bot detection issues
- **Security Audit Workflow**: `pnpm audit --json --prod` runs on push to main, generates `audit.json` and a live vulnerability badge via shields.io endpoint. Color-coded by severity (green→yellow→orange→red).
- **SBOM Workflow**: `pnpm sbom --prod --sbom-format cyclonedx` generates `sbom.json` on push to main for supply-chain transparency.
- **Dogfood Workflow**: Demo-reel runs `the-internet-login` demo end-to-end in CI on every push to main — voice generation, recording, and video output — proving the full pipeline works without Docker.

### Changed

- **Unbundled voice lists**: Removed hard-coded voice enum constants (PIPER_VOICES, OPENAI_VOICES, ELEVENLABS_VOICES). All TTS providers now accept any voice name/ID string. Defaults preserved.
- **pnpm v11**: Upgraded to pnpm v11. CI workflows use `pnpm ci` instead of `pnpm install --frozen-lockfile`. Deprecated `onlyBuiltDependencies` replaced with `allowBuilds` map.
- **Removed pnpm version spec from workflows**: CI workflows no longer specify a pnpm version explicitly. The `pnpm/action-setup` action reads `packageManager` from `package.json` as the single source of truth.

### Removed

- **Docker**: Removed entirely — no Dockerfile, no Docker image publishing, no Docker spawns in the codebase
  - Voice generation runs directly in-process via local TTS (Piper, OpenAI, or ElevenLabs)
  - Recording always runs locally via Playwright + FFmpeg
  - `--no-docker` flag removed (local is the only mode)
- **`templates/` directory**: Removed stale template files. The `init` command is self-contained with an inline template.
- **`pnpm demo` and `pnpm demo:voice` scripts**: `pnpm demo-reel` (the bin entry) is the correct CLI path using tsgo-compiled dist.
- **`dist/` from git tracking**: Build artifacts no longer committed to git. Generated by `prepare` script before publish.
- **Dictionary search demos**: Replaced with the-internet demo suite (no bot detection, purpose-built for automation).

### Fixed

- **Drag and drop**: Replaced naive `DragTo`/mouse-event approach with proper HTML5 DragEvent + DataTransfer dispatch. Cursor now shows human bezier drag animation from source to target with visual click-down and release.
- **CI/CD README example**: Updated to working state — uses `pnpm ci`, real demo name, proper Playwright setup, correct GitHub Actions secrets syntax.

## [0.5.0] - 2026-04-24

### Added

- **Scene-Owned Steps**: Scenes can now define their own `steps` array, eliminating the need to manually count `stepIndex`
  - New authoring format: `scenes: [{ narration: "...", steps: [...] }]`
  - Legacy format with top-level `steps` + `scenes[].stepIndex` still supported
  - Mixed formats are rejected with clear validation errors
  - Schema normalizes scene-owned steps into runtime `steps[]` + `scenes[]` with auto-derived `stepIndex`
- **Legacy Scene Validation**: `stepIndex` values must now be strictly increasing and within bounds
- **Demo Template**: Added `demos/dictionary-search.demo.ts` — a working 5-scene example using DuckDuckGo and Wiktionary

### Changed

- **Generated `.demo.ts` output**: Script assembler now emits scene-owned steps instead of manual `stepIndex`
- **`init` command template**: Updated to use scene-owned format by default
- **README examples**: Updated to canonical scene-owned format with legacy compatibility note

### Fixed

- **Type safety**: Added explicit `RuntimeScene` interface and `DemoReelConfig` output type to reflect normalized post-transform shape

## [0.4.2] - 2026-04-20

### Added

- **Narration Manifest Pipeline**: Per-scene narration manifests and clip artifacts for exact scene-based audio placement during rendering
- **Provider-Aware Voice Config**: Centralized voice config parsing with curated provider defaults and `voicePath` support for custom Piper models
- **Confirm Dialog Step**: New `confirm` step to explicitly accept or dismiss browser dialogs as part of a demo flow
- **Ordered CI Workflow**: GitHub Actions workflow that runs format, lint, test, and build in sequence with clear step-level failure reporting
- **Coverage Badge Automation**: README coverage badge generated from Vitest coverage totals and refreshed automatically on `main`
- **AI Script Generation**: New `demo-reel script` command for AI-powered demo video creation
  - `script generate` — Generate a demo script from a natural language description using Claude API
  - `script voice` — Generate voiceover narration audio via OpenAI TTS with caching
  - `script build` — Assemble a timed `.demo.ts` from a script with audio-synced timing
  - `script validate` — Validate selectors against the live app
  - `script fix` — Re-crawl and fix broken selectors via LLM
  - Full pipeline shortcut: `demo-reel script "description" --url <url>`
- **DOM Crawler**: Playwright-based interactive element extraction with selector ranking (data-testid > id > href > class > custom)
- **Timing Engine**: Audio-first synchronization that adjusts step delays to match narration duration
- **Voice Caching**: Generated audio cached by content hash in `.demo-reel-cache/voice/`
- **`/demo-script` Claude Code Skill**: Interactive, collaborative script building inside Claude Code — crawl pages, draft scenes together, iterate on narration, generate `.demo.ts` files
- **Site Explorer**: `explore.ts` logs in and clicks through SPA pages to discover selectors and page structure
- **Modular Video Series Pattern**: Design pattern for standalone videos that work independently and as a guided series — each video has its own preSteps for reproducible state setup
- **Piper TTS Provider**: Local, free text-to-speech via Piper with Dutch voice support (`nl_NL-mls-medium`). No API key required for development iteration.
- **TTS Provider Interface**: Pluggable provider system — `piper` (local/free, default) and `openai` built-in, with `registerTTSProvider()` for custom providers
- **Scene Timeline Tracking**: `runDemo()` now records wall-clock timestamps for each scene boundary during recording
- **Subtitle Generation**: Automatically generates `.srt` and `.vtt` subtitle files alongside the video, with per-scene narration text and actual timestamps
- **Scene Metadata**: Generates `.meta.json` with scene timestamps, intro end point, and chapter markers for interactive presentation systems
- **`scenes` Config Field**: New optional config field to declare scene boundaries with narration text, step indices, and intro markers

### Fixed

- **Subtitle timing accuracy**: Narrated scenes now use exact per-scene narration placement instead of inferred offsets when manifests are available
- **Narration artifact invalidation**: Voice assets are regenerated when narration processing logic changes, avoiding stale output reuse
- **Docker runtime file ownership**: Containerized runs now preserve host user ownership more reliably by passing through UID/GID when available
- **Video recording without auth**: Scenarios without `auth` config now correctly record video (was calling `startBrowser` instead of `startRecording`)
- **preSteps execution**: `preSteps` are now actually executed before recording begins (were silently ignored)
- **Temp file cleanup**: Temporary video files in `.demo-reel-temp/` are now deleted after processing
- **Smooth scroll animation**: `scroll` steps now animate smoothly with eased incremental scrolling instead of jumping instantly
- **Native cursor hidden**: Browser's native cursor is now hidden via CSS when the cursor overlay is active, preventing double cursors

### Added

- **Built-in Presets**: Simplified configuration with preset shortcuts for cursor, motion, typing, and timing
  - Cursor presets: `'dot'`, `'arrow'`, `'none'`
  - Motion presets: `'smooth'`, `'snappy'`, `'instant'`
  - Typing presets: `'humanlike'`, `'fast'`, `'instant'`
  - Timing presets: `'normal'`, `'fast'`, `'instant'`
  - Use string shortcuts (e.g., `cursor: 'dot'`) or full objects (e.g., `cursor: { type: 'dot', size: 16 }`)
- **`init` Command**: New `demo-reel init` command creates `example.demo.ts` template
- **Documentation**: Added descriptive `.describe()` calls on all Zod schema fields for IDE tooltips
- **Selector Indexing**: Select a specific match with `selector.index` (0-based)
- **New Selector Strategy**: `data-node-id` for `[data-node-id="..."]`
- **Custom Selector Strategy**: `custom` uses a raw selector string
- **Type Clear Option**: `type` steps support `clear: true` to clear inputs before typing
- **Output Format**: `outputFormat` lets you choose `webm` or `mp4` (audio requires `mp4`)
- **Randomization Seed**: `randomization.seed` enables deterministic cursor/typing variation
- **Scenario Tags**: `tags` plus `--tag` CLI filtering

### Changed

- **Product-specific helpers removed**: Removed the product-specific helper and example assets so the package stays app-agnostic
- **Voice configuration model**: Voice settings are now resolved through a shared provider-specific schema used by the main CLI and script tooling
- **Narration/subtitle synchronization**: Video processing now aligns narration clips to recorded scene timestamps and surfaces overlap/missing-scene warnings
- **Docker image layout**: Container build now uses stricter multi-stage packaging, verified Piper downloads, isolated Playwright browser installation, and non-root runtime defaults
- **Docs and examples**: Voice examples now use provider-specific values and document custom Piper `voicePath` usage
- **Demo assets**: Removed the old product-specific demo/config example from the repository
- **`demo-reel` (no args)**: Now runs all `*.demo.ts` files instead of requiring `--all` flag
- **Simplified CLI**: Removed default config file concept; scenarios are always `*.demo.ts` files
- **Type Exports**: Added `DemoReelConfigInput` type for autocomplete with preset strings
- **Video Resolution Config**: Removed `viewport` and `video.enabled`; use `video.resolution`

### Technical

- Added `narration-manifest.ts` and `voice-config.ts` modules to centralize narration artifact metadata and voice resolution
- Added `coverage:badge`, `format:ci`, and `lint:ci` scripts for CI and badge generation workflows
- New `presets.ts` module with preset definitions
- Restructured schema to separate input types (for autocomplete) from output types (after transform)
- `defineConfig()` accepts preset strings and transforms them at parse time
- `demoReelConfigInputSchema` exported for IDE type inference

## [0.1.3] - 2026-03-21

### Added

- **TypeScript Go Port (tsgo)**: Now using Microsoft's native TypeScript compiler
  - 3x faster builds (0.64s vs 1.86s)
  - Native Go implementation of TypeScript compiler
  - Experimental but working well for this codebase
  - Fallback to tsc available with `pnpm build:tsc`
- **Session Persistence**: Complete authentication system with session capture and restoration
  - New `auth` configuration with `loginSteps`, `validate`, `storage`, and `behavior` options
  - Automatic session validation before running demos
  - Support for cookies and localStorage capture
  - Multiple named sessions support for different apps/users
  - Smart re-authentication when sessions expire
  - Force re-auth option to bypass saved sessions
  - Clear invalid sessions automatically
  - Comprehensive test suite (37 tests)

### Changed

- **Breaking**: Old auth config format deprecated (`persistCookies`, `cookieFile`, `loginUrl`, `successUrl`)
- Sessions now stored in structured JSON format in `.demo-reel-sessions/` directory
- Better session isolation with named sessions per demo configuration
- Added vitest testing framework

### Fixed

- Session validation properly waits for success indicator element with `waitFor()` and 5 second timeout
- Fixed strict mode violation error when multiple elements match success indicator selector (uses `.first()`)
- Changed page load from `domcontentloaded` to `networkidle` for better reliability
- Added verbose logging to help debug validation issues

## [0.1.2-beta.2] - 2026-03-21

### Fixed

- Fixed strict mode violation error when multiple elements match success indicator selector
  - Use `.first()` to handle multiple matching elements
  - Added verbose logging to help debug validation issues

## [0.1.2-beta.1] - 2026-03-21

### Fixed

- Session validation now properly waits for success indicator element
  - Changed from `isVisible()` (instant check) to `waitFor()` with 5 second timeout
  - Changed page load from `domcontentloaded` to `networkidle` for better reliability

## [0.1.2-beta.0] - 2026-03-21

### Added

- **Session Persistence**: Intelligent authentication with session capture and restoration
  - New `auth` configuration with `loginSteps`, `validate`, `storage`, and `behavior` options
  - Automatic session validation before running demos
  - Support for cookies and localStorage capture
  - Multiple named sessions support for different apps/users
  - Smart re-authentication when sessions expire
  - Force re-auth option to bypass saved sessions
  - Clear invalid sessions automatically

### Changed

- **Breaking**: Old auth config format deprecated (`persistCookies`, `cookieFile`, `loginUrl`, `successUrl`)
- Sessions now stored in structured JSON format in `.demo-reel-sessions/` directory
- Better session isolation with named sessions per demo configuration

### Technical

- New `auth.ts` module for session management
- Updated video handler with integrated auth flow
- New types exported: `StorageType`, `AuthStorageConfig`, `AuthValidateConfig`, `AuthBehaviorConfig`

## [0.1.1-beta.1] - 2024-03-19

### Fixed

- Audio mixing now outputs MP4 format instead of WebM (WebM doesn't support AAC audio codec)

## [0.1.1-beta.0] - 2024-03-19

### Added

- **Audio Support**: Add narration and background music to demo videos
  - Support for MP3 audio files
  - Mix narration with background music
  - Configurable background music volume (0.0 - 1.0)
  - FFmpeg integration via ffmpeg-static
- New `audio` config option with `narration`, `background`, and `backgroundVolume` fields
- Audio paths resolved relative to config file location
- Video continues playing even if audio ends first

### Technical

- Added `ffmpeg-static` as a required dependency
- New `audio-processor.ts` module for FFmpeg operations
- Updated video handler to support audio mixing
- Updated config schema to validate audio options

## [0.1.0] - 2024-03-19

### Added

- Initial release of demo-reel
- CLI tool for creating demo videos from web apps
- `defineConfig()` API for TypeScript-first configuration
- Support for multiple scenario files (\*.demo.ts)
- Video recording via Playwright
- Human-like cursor movement with Bezier curves
- Natural typing with variable delays
- Custom cursor overlay (SVG or dot style)
- Configurable viewport and video size
- Config discovery: demo-reel.config.ts, \*.demo.ts, --all flag
- CI/CD ready with proper exit codes
- Dry-run mode for config validation
- Published to npm

### Features

- 12 step types: goto, click, hover, type, press, scroll, select, check, upload, drag, wait, waitFor
- 4 selector strategies: testId, id, class, href
- Configurable motion, typing, and timing settings
- Progress reporting and verbose output
