# Stages Module

## Purpose

Each stage encapsulates one phase of the demo generation pipeline. Stages are independent, self-contained, and communicate only through `PipelineContext`.

## Location

`src/stages/`

## Stage Sequence

The default pipeline runs 7 stages:

```
TTSStage → AuthStage → PreStepsStage → RecordingStage → AudioMixStage → OutputStage → PostStepsStage
```

`NarrationSyncStage` (`sync.ts`) is an optional stage not included in the default pipeline. It provides the estimate-based step-padding engine for custom pipeline compositions.

---

## Stage Specifications

### 1. TTSStage (`tts.ts`)

| Property          | Value                                                                 |
| ----------------- | --------------------------------------------------------------------- |
| **Purpose**       | Generate voiceover narration audio from text                          |
| **Precondition**  | Config has `voice` + at least one scene with `narration`              |
| **Skip if**       | No voice config, no narration, or audio already provided              |
| **Writes to ctx** | `ctx.narrationManifest`, `ctx.audioPath`, `ctx.narrationManifestPath` |

**Logic:**

1. Skip if `config.voice` is not set
2. Skip if no scenes have narration
3. Skip if narration artifacts already exist and are fresh (manifest version match) — unless `ctx.noCache` is set
4. For each narrated scene, generate audio segment via TTS provider
5. Concatenate segments into a single MP3 file
6. Write `narration-manifest.json` with clip metadata
7. Set `ctx.narrationManifest`, `ctx.audioPath`, `ctx.narrationManifestPath`

**Dependencies:** `voice/*`, `narration-manifest.ts`, `voice-config.ts`

### 2. NarrationSyncStage (`sync.ts`) — Optional Stage

| Property          | Value                                                 |
| ----------------- | ----------------------------------------------------- |
| **Purpose**       | Align step timing to audio durations (estimate-based) |
| **Precondition**  | `ctx.narrationManifest` exists                        |
| **Skip if**       | `config.timing.narrationSyncMode === "off"`           |
| **Writes to ctx** | `ctx.config` (padded steps), scene step indices       |

**Note:** This stage is **not in the default pipeline**. The default behavior uses post-recording auto-shift in `AudioMixStage` (see below) instead of estimate-based step padding. Include this stage only if you need the legacy pre-recording estimate-based timing adjustment.

**Logic:**

1. Skip if sync mode is `"off"`
2. Read manifest from `ctx.narrationManifest`
3. Build `NarrationClipInfo[]` from manifest clips
4. Call `syncNarration()` with clips, steps, scenes, sync config
5. If mode is `"strict"` and overflow exists → throw
6. If padding was applied → update `ctx.config.steps` and scene indices
7. Log sync report if verbose

**Dependencies:** `narration-sync.ts`

### 2. AuthStage (`auth.ts`)

| Property          | Value                                                           |
| ----------------- | --------------------------------------------------------------- |
| **Purpose**       | Handle authentication: check session, validate, login if needed |
| **Precondition**  | `config.auth` exists                                            |
| **Skip if**       | No auth config                                                  |
| **Writes to ctx** | Session saved to disk                                           |

**Logic:**

1. Skip if `config.auth` is not set
2. Launch a setup browser via `ctx.browserPool`
3. Check for existing session file
4. Restore cookies/localStorage if session found
5. Validate session by navigating to protected URL + checking success element
6. If invalid/missing → run `config.auth.loginSteps` + capture/save new session
7. Close setup browser

**Dependencies:** `auth.ts`, `browser/*`, `runner/*`

### 3. PreStepsStage (`pre-steps.ts`)

| Property          | Value                                           |
| ----------------- | ----------------------------------------------- |
| **Purpose**       | Run pre-recording setup steps                   |
| **Precondition**  | `config.preSteps` (or `config.setup`) has steps |
| **Skip if**       | No setup steps defined                          |
| **Writes to ctx** | Nothing                                         |

**Logic:**

1. Skip if no pre-steps
2. Launch a setup browser via `ctx.browserPool`
3. Run all pre-steps in tolerant mode (don't fail on error)
4. Close setup browser

**Dependencies:** `browser/*`, `runner/*`

### 4. RecordingStage (`recording.ts`)

| Property          | Value                                      |
| ----------------- | ------------------------------------------ |
| **Purpose**       | Run the demo scenario with video recording |
| **Precondition**  | Auth is done, pre-steps complete           |
| **Never skips**   | This is the core stage                     |
| **Writes to ctx** | `ctx.tempVideoPath`, `ctx.sceneTimestamps` |

**Logic:**

1. Launch recording browser via `ctx.browserPool`
2. Restore auth session if needed
3. Install cursor overlay (`installCursorOverlay()`)
4. Execute all steps via `runDemo()`
5. Track scene boundaries + timestamps
6. Stop recording → get temp video path
7. Save session if auth configured
8. Set `ctx.tempVideoPath` and `ctx.sceneTimestamps`

**Dependencies:** `browser/*`, `runner/*`, `auth.ts`

### 5. AudioMixStage (`audio-mix.ts`)

| Property          | Value                                                           |
| ----------------- | --------------------------------------------------------------- |
| **Purpose**       | Merge audio tracks with recorded video using FFmpeg             |
| **Precondition**  | `ctx.tempVideoPath` exists                                      |
| **Skip if**       | No audio config (narration or background)                       |
| **Writes to ctx** | `ctx.finalVideoPath`, `ctx.narrationPlacements`, `ctx.warnings` |

**Logic:**

1. Skip if no audio config
2. Parse narration manifest to build `NarrationPlacement[]` from real scene timestamps
3. Auto-shift overlapping placements forward to prevent narration overlap (in `auto` mode), throw in `strict` mode, skip in `off` mode
4. Call `mergeAudioVideo()` with video + narration placements + background
5. Set `ctx.finalVideoPath`, `ctx.narrationPlacements`, push warnings to `ctx.warnings`

**Dependencies:** `ffmpeg/*`, `narration-manifest.ts`

### 6. OutputStage (`output.ts`)

| Property          | Value                                                   |
| ----------------- | ------------------------------------------------------- |
| **Purpose**       | Generate subtitles, metadata files, clean up temp files |
| **Precondition**  | `ctx.finalVideoPath` + `ctx.sceneTimestamps` exist      |
| **Never skips**   | Always runs if recording succeeded                      |
| **Writes to ctx** | Output files on disk                                    |

**Logic:**

1. Build subtitle cues from scene timestamps + narration placements
2. Generate SRT file → `${base}.srt`
3. Generate VTT file → `${base}.vtt`
4. Generate metadata JSON → `${base}.meta.json`
5. Clean up temp video directory

**Dependencies:** `narration-manifest.ts`

### 7. PostStepsStage (`post-steps.ts`)

| Property          | Value                                              |
| ----------------- | -------------------------------------------------- |
| **Purpose**       | Run cleanup steps after recording                  |
| **Precondition**  | `config.postSteps` (or `config.cleanup`) has steps |
| **Skip if**       | No cleanup steps defined                           |
| **Writes to ctx** | Nothing                                            |

**Logic:**

1. Skip if no post-steps
2. Launch a fresh browser via `ctx.browserPool`
3. Restore auth session if needed
4. Run all post-steps in tolerant mode
5. Close browser

**Dependencies:** `browser/*`, `runner/*`, `auth.ts`

---

## Stage Contract

Every stage must:

1. Check its own preconditions and short-circuit if not applicable
2. Never throw unless the error is fatal (e.g., strict mode overflow)
3. Push non-fatal warnings to `ctx.warnings`
4. Set `ctx` fields atomically (don't write partial state)
5. Document which `ctx` fields it requires and which it produces
