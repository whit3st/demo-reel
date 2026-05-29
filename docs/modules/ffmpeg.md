# FFmpeg Module

## Purpose

Single, shared FFmpeg wrapper for all audio/video processing. Replaces two duplicate implementations:

- `src/audio-processor.ts` — `getFfmpegPath()`, `mergeAudioVideo()`, `buildFfmpegArgs()`
- `src/script/tts.ts` — `getFFmpegPath()`, `getFFprobePath()`, `runFFmpeg()`, `runFfprobe()`

## Location

`src/ffmpeg/`

## File

### `utils.ts`

Single file consolidating all FFmpeg functionality.

## API

### Binary Resolution

```ts
export async function getFfmpegPath(): Promise<string | null>;
export async function getFfprobePath(): Promise<string | null>;
export async function isFfmpegAvailable(): Promise<boolean>;
```

**Resolution strategy:**

1. Try `ffmpeg-static` npm package (self-contained binary)
2. Verify the binary actually exists on disk
3. Fall back to system `ffmpeg` / `ffprobe` on PATH

### Execution

```ts
export function runFFmpeg(args: string[], options?: RunOptions): Promise<void>;
export function runFfprobe(args: string[], options?: RunOptions): Promise<string>;

interface RunOptions {
  timeoutMs?: number;
  cwd?: string;
}
```

Runs FFmpeg/FFprobe as a child process. Returns a promise that resolves on success or rejects with stderr on failure.

### Audio/Video Merge

```ts
export async function mergeAudioVideo(options: MergeOptions): Promise<string>;

interface MergeOptions {
  videoPath: string;
  outputPath: string;
  audio?: AudioConfig & { narrationPlacements?: NarrationPlacement[] };
}
```

**What it does:**

1. If no audio → copy video file (no re-encode)
2. If `narrationPlacements` → use adelay + amix filters for per-scene placement
3. If single narration file → simple adelay filter
4. If background music → volume filter + amix
5. Re-encodes to H.264 + AAC for MP4 compatibility (WebM doesn't support AAC)

**Key FFmpeg arguments:**

```
-y -i video.webm -i narration.mp3 [-i background.mp3]
-filter_complex "[1:a]adelay=300|300,volume=1[narr];[narr]...[out]"
-map 0:v -map [out]
-c:v libx264 -preset fast -crf 23
-c:a aac -b:a 192k
-movflags +faststart
output.mp4
```

### Audio Path Resolution

```ts
export function resolveAudioPaths(audio: AudioConfig, configDir: string): AudioConfig;
```

Resolves relative audio paths against the config file directory.

### Build FFmpeg Arguments

```ts
export function buildFfmpegArgs(
  videoPath: string,
  outputPath: string,
  audio: AudioConfig,
): string[];
```

Pure function — builds the FFmpeg argument array without executing. Useful for testing and debugging.

## Narration Placement

The key audio feature is **replay-mode** narration placement:

```ts
interface NarrationPlacement {
  sceneIndex: number;
  narration: string;
  clipPath: string; // Path to individual scene MP3
  startMs: number; // When to start this clip
  endMs: number; // When it ends
}
```

Instead of a single narration track, per-scene clips are placed at precise timestamps using FFmpeg's `adelay` filter:

```
[1:a]adelay=1500|1500,volume=1[n0]    // Scene 0 starts at 1500ms
[2:a]adelay=4200|4200,volume=1[n1]    // Scene 1 starts at 4200ms
[n0][n1]amix=inputs=2:duration=longest[narr]
```

This avoids re-encoding the entire narration track when only step timing changes.

## Overlap Detection

The module detects and warns about narration overlaps:

```ts
for (let i = 1; i < narrationPlacements.length; i++) {
  if (current.startMs < previous.endMs) {
    warnings.push(`Narration overlap: scene ${current.sceneIndex} ...`);
  }
}
```

Overlaps can happen when narration sync mode is `"off"` or when multiple fast scenes have long narrations.

## Duplicate Code Eliminated

| Function              | `audio-processor.ts`          | `script/tts.ts`          | `ffmpeg/utils.ts`        |
| --------------------- | ----------------------------- | ------------------------ | ------------------------ |
| `getFfmpegPath()`     | `async getFfmpegPath()`       | `async getFFmpegPath()`  | `async getFfmpegPath()`  |
| `getFfprobePath()`    | N/A                           | `async getFFprobePath()` | `async getFfprobePath()` |
| `runFFmpeg()`         | inline in `mergeAudioVideo()` | `runFFmpeg()`            | `runFFmpeg()`            |
| `runFfprobe()`        | N/A                           | `runFfprobe()`           | `runFfprobe()`           |
| `mergeAudioVideo()`   | `mergeAudioVideo()`           | N/A                      | `mergeAudioVideo()`      |
| `buildFfmpegArgs()`   | `buildFfmpegArgs()`           | N/A                      | `buildFfmpegArgs()`      |
| `isFfmpegAvailable()` | `isFfmpegAvailable()`         | N/A                      | `isFfmpegAvailable()`    |
| `resolveAudioPaths()` | `resolveAudioPaths()`         | N/A                      | `resolveAudioPaths()`    |
