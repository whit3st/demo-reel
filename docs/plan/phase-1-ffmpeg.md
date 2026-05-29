# Phase 1: Single FFmpeg Wrapper

## Objective

Merge two duplicate FFmpeg implementations into one shared module:

- `src/audio-processor.ts` — `getFfmpegPath()`, `mergeAudioVideo()`, `buildFfmpegArgs()`, `isFfmpegAvailable()`, `resolveAudioPaths()`
- `src/script/tts.ts` — `getFFmpegPath()`, `getFFprobePath()`, `runFFmpeg()`, `runFfprobe()`, `measureAudioDuration()`, `wavToMp3()`, `generateSilence()`, `concatenateAudio()`

## Files to Create

### `src/ffmpeg/utils.ts`

```ts
// Exports:
export async function getFfmpegPath(): Promise<string>;
export async function getFfprobePath(): Promise<string>;
export async function isFfmpegAvailable(): Promise<boolean>;
export function runFFmpeg(args: string[], options?: { timeoutMs?: number }): Promise<void>;
export function runFfprobe(args: string[]): Promise<string>;
export async function measureAudioDuration(audioBuffer: Buffer): Promise<number>;
export async function wavToMp3(wavBuffer: Buffer): Promise<Buffer>;
export async function generateSilence(outputPath: string, durationMs: number): Promise<void>;
export async function concatenateAudio(
  segments: { audio: Buffer; gapAfterMs: number }[],
): Promise<Buffer>;
export async function mergeAudioVideo(options: MergeOptions): Promise<string>;
export function buildFfmpegArgs(
  videoPath: string,
  outputPath: string,
  audio: AudioConfig,
): string[];
export function resolveAudioPaths(
  audio: AudioConfig | undefined,
  configDir: string,
): AudioConfig | undefined;
export type { AudioConfig, MergeOptions, NarrationPlacement };
```

### What to copy

From `src/audio-processor.ts`:

- `getFfmpegPath()` — rename to match naming convention (keep camelCase)
- `mergeAudioVideo()` — pulled as-is
- `buildFfmpegArgs()` — pulled as-is
- `isFfmpegAvailable()` — pulled as-is
- `resolveAudioPaths()` — pulled as-is
- `AudioConfig`, `MergeOptions`, `NarrationPlacement` types

From `src/script/tts.ts`:

- `getFFprobePath()` — rename to `getFfprobePath()` (camelCase consistency)
- `runFFmpeg()` — kept, is the canonical version (simpler than audio-processor's inline spawn)
- `runFfprobe()` — kept, is the canonical version
- `measureAudioDuration()` — uses both ffprobe + temp file; pulled as-is
- `wavToMp3()` — WAV→MP3 conversion via FFmpeg; pulled as-is
- `generateSilence()` — generates silent MP3; pulled as-is (but remove `ffmpegPath` param — get internally)
- `concatenateAudio()` — concats audio segments with gaps; pulled as-is (but remove `ffmpegPath` param — get internally)

### Resolution conflict

Both files have `getFfmpegPath()`. They're nearly identical but:

- `audio-processor.ts` version: tries `ffmpeg-static`, falls back to `"ffmpeg"`
- `script/tts.ts` version: tries `ffmpeg-static`, falls back to `"ffmpeg"` (same logic, slightly different error handling)

**Resolution:** Use one implementation. The only difference is error handling — use the simpler version (from `audio-processor.ts`). The `getFFprobePath()` logic (check adjacent to ffmpeg path) moves in too.

## Files to Modify

### `src/audio-processor.ts`

After Phase 1, this file becomes a thin re-export barrel:

```ts
// Re-export everything from the new unified module
export {
  mergeAudioVideo,
  buildFfmpegArgs,
  resolveAudioPaths,
  isFfmpegAvailable,
  getFfmpegPath,
} from "./ffmpeg/utils.js";
export type { AudioConfig, NarrationPlacement, MergeOptions } from "./ffmpeg/utils.js";
```

All old imports of `audio-processor.ts` continue to work.

### `src/script/tts.ts`

Replace the duplicated functions with imports from `ffmpeg/utils.ts`:

```ts
// Remove:
//   getFFmpegPath()     → import { getFfmpegPath } from "../ffmpeg/utils.js"
//   getFFprobePath()    → import { getFfprobePath } from "../ffmpeg/utils.js"
//   runFFmpeg()         → import { runFFmpeg } from "../ffmpeg/utils.js"
//   runFfprobe()        → import { runFfprobe } from "../ffmpeg/utils.js"
//   measureAudioDuration() → import { measureAudioDuration } from "../ffmpeg/utils.js"
//   wavToMp3()          → import { wavToMp3 } from "../ffmpeg/utils.js"
//   generateSilence()   → import { generateSilence } from "../ffmpeg/utils.js"
//   concatenateAudio()  → import { concatenateAudio } from "../ffmpeg/utils.js"

// Keep:
//   TTSProvider, getTTSProvider, registerTTSProvider
//   generatePiper, generateOpenAI, generateElevenLabs
//   cacheKey, getCached, setCache
//   VoiceSegment, applyPronunciation
//   generateVoiceSegments, generateNarrationAudio
```

Also update internal calls:

- `getFFmpegPath()` → `getFfmpegPath()` — simple rename
- `getFFprobePath(ffmpegPath)` → `getFfprobePath()` — no arg needed (looks up internally)
- `runFFmpeg(ffmpegPath, args)` → `runFFmpeg(args)` — no ffmpegPath arg needed
- `runFfprobe(ffprobePath, args)` → `runFfprobe(args)` — no ffprobePath arg needed
- `generateSilence(ffmpegPath, ...)` → `generateSilence(...)` — no ffmpegPath arg needed
- `concatenateAudio()` — remove `const ffmpegPath = await getFfmpegPath()` line, use internal

### `src/index.ts` (public API)

Optionally add re-exports so consumers can import from `"demo-reel"`:

```ts
export {
  mergeAudioVideo,
  buildFfmpegArgs,
  resolveAudioPaths,
  isFfmpegAvailable,
} from "./ffmpeg/utils.js";
export type { AudioConfig, NarrationPlacement, MergeOptions } from "./ffmpeg/utils.js";
```

## Verification

```bash
pnpm lint
pnpm test test/audio-processor.test.ts test/audio-processor.integration.test.ts test/tts.test.ts
pnpm build
```

Key test files that must still pass:

- `test/audio-processor.test.ts` — tests `mergeAudioVideo`, `buildFfmpegArgs`
- `test/audio-processor.integration.test.ts` — integration tests
- `test/tts.test.ts` — tests TTS generation (uses `runFFmpeg`, `wavToMp3`)

## Backward Compatibility

- `import { mergeAudioVideo } from "./audio-processor.js"` still works (re-exports)
- `import { generateVoiceSegments } from "./script/tts.js"` still works (unchanged)
- All public API consumers unaffected

## Dependencies

None — Phase 1 can be done first and independently.
