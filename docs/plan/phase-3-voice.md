# Phase 3: Extract Voice Module

## Objective

Split `src/script/tts.ts` (587 lines) into:

- `src/voice/` — TTS provider abstraction (reusable, not script-specific)
- `src/script/tts.ts` — re-export barrel (backward compat)

Also move `src/piper.ts` into `src/voice/piper.ts` as part of the voice module.

## Files to Create

### `src/voice/types.ts` (~15 lines)

```ts
import type { VoiceConfig } from "../voice-config.js";

export interface TTSProvider {
  readonly name: string;
  generate(text: string, options: VoiceConfig): Promise<{ audio: Buffer; durationMs: number }>;
}

export interface VoiceSegment {
  sceneIndex: number;
  stepIndex?: number;
  sourceSceneIndex?: number;
  narration: string;
  audio: Buffer;
  durationMs: number;
}
```

### `src/voice/index.ts` (~50 lines)

```ts
import type { VoiceConfig } from "../voice-config.js";

export type { TTSProvider, VoiceSegment } from "./types.js";

const providers = new Map<string, TTSProvider>();

export function registerTTSProvider(provider: TTSProvider): void {
  providers.set(provider.name, provider);
}

export function getTTSProvider(name: string): TTSProvider {
  const provider = providers.get(name);
  if (!provider) {
    throw new Error(
      `Unknown TTS provider: "${name}". Available: ${[...providers.keys()].join(", ")}`,
    );
  }
  return provider;
}

export function getAvailableProviders(): string[] {
  return [...providers.keys()];
}
```

### `src/voice/piper.ts` (~180 lines — move + wrap)

Move from `src/script/tts.ts` lines 148-249 (`findPiperBinary`, `getPiperModelDir`, `getPiperModelPath`, `generatePiper`) and wrap as a provider:

```ts
import type { VoiceConfig } from "../voice-config.js";
import type { TTSProvider } from "./types.js";
import { ensurePiperBinary, ensurePiperModel } from "../piper.js";
import { wavToMp3, measureAudioDuration } from "../ffmpeg/utils.js";

export const piperProvider: TTSProvider = {
  name: "piper",
  generate: async (text, options) => {
    // ... inner logic from generatePiper
  },
};
```

Also move the core piper logic from `src/piper.ts` into this file (or keep `src/piper.ts` as-is and import from it — simpler). Keep `src/piper.ts` as-is; `src/voice/piper.ts` wraps it.

### `src/voice/openai.ts` (~40 lines — move + wrap)

```ts
import type { TTSProvider } from "./types.js";
import { measureAudioDuration } from "../ffmpeg/utils.js";

export const openaiProvider: TTSProvider = {
  name: "openai",
  generate: async (text, options) => {
    // ... inner logic from generateOpenAI (script/tts.ts lines 253-275)
  },
};
```

### `src/voice/elevenlabs.ts` (~50 lines — move + wrap)

```ts
import type { TTSProvider } from "./types.js";
import { measureAudioDuration } from "../ffmpeg/utils.js";

export const elevenlabsProvider: TTSProvider = {
  name: "elevenlabs",
  generate: async (text, options) => {
    // ... inner logic from generateElevenLabs (script/tts.ts lines 279-320)
  },
};
```

### `src/voice/cache.ts` (~50 lines — move)

```ts
import { mkdir, writeFile, readFile, stat } from "fs/promises"
import { join } from "path"
import { createHash } from "crypto"
import { getVoiceName, type VoiceConfig } from "../voice-config.js"

const CACHE_DIR = ".demo-reel-cache/voice"

export function cacheKey(text: string, voice: VoiceConfig): string { ... }
export async function getCached(key: string): Promise<Buffer | null> { ... }
export async function setCache(key: string, audio: Buffer): Promise<void> { ... }
```

Extracted from: `script/tts.ts` lines 358-381.

## Files to Modify

### `src/script/tts.ts`

Replace extracted content with imports from `src/voice/`:

```ts
// Remove: TTSProvider type, getTTSProvider, registerTTSProvider,
//         generatePiper, generateOpenAI, generateElevenLabs,
//         providers object, provider registry functions,
//         cache key functions, VoiceSegment type

// Re-export for backward compatibility:
export type { TTSProvider, VoiceSegment } from "../voice/index.js";
export { registerTTSProvider, getTTSProvider } from "../voice/index.js";

// Keep only script-specific functions:
export { applyPronunciation, generateVoiceSegments, generateNarrationAudio };
```

Actually, `generateVoiceSegments` and `generateNarrationAudio` are the main high-level API that `index.ts::generate()` calls. They should stay in `script/tts.ts` but use `src/voice/` internally:

```ts
import { getTTSProvider } from "../voice/index.js"
import { cacheKey, getCached, setCache } from "../voice/cache.js"
import { measureAudioDuration } from "../ffmpeg/utils.js"
import { getNarrationClipDir, getNarrationClipFileName, getNarrationManifestPath, NARRATION_PROCESSING_VERSION, type NarrationManifest } from "../narration-manifest.js"

export { registerTTSProvider, getTTSProvider } from "../voice/index.js"
export type { TTSProvider, VoiceSegment } from "../voice/index.js"

export function applyPronunciation(text: string, pronunciation?: Record<string, string>): string { ... }
export async function generateVoiceSegments(script: DemoScript, voice: VoiceConfig, options?): Promise<VoiceSegment[]> { ... }
export async function generateNarrationAudio(segments: VoiceSegment[], outputPath: string, options?): Promise<...> { ... }
```

### `src/script/tts.ts` — register providers

At module init or in a setup function, register the three providers:

```ts
import { registerTTSProvider } from "../voice/index.js";
import { piperProvider } from "../voice/piper.js";
import { openaiProvider } from "../voice/openai.js";
import { elevenlabsProvider } from "../voice/elevenlabs.js";

registerTTSProvider(piperProvider);
registerTTSProvider(openaiProvider);
registerTTSProvider(elevenlabsProvider);
```

This can be done in `voice/index.ts` as a `registerDefaultProviders()` function, or lazily.

### `src/index.ts` — import check

```ts
// Current import in generate():
const { generateVoiceSegments, generateNarrationAudio } = await import("./script/tts.js");
```

This dynamic import must still work. Since `script/tts.ts` re-exports from `voice/`, no change needed.

### `src/piper.ts`

No changes. Kept as-is; `voice/piper.ts` imports from it. Eventually `piper.ts` could be moved entirely into `voice/piper.ts`, but that's optional cleanup.

## Optional: Test files

New test files could be added but not required for this phase:

- `test/voice/piper.test.ts` — mock the piper binary, test provider
- `test/voice/cache.test.ts` — test cache key + read/write

## Verification

```bash
pnpm lint
pnpm test test/tts.test.ts test/voice-cli.test.ts
pnpm build
```

Key test files:

- `test/tts.test.ts` — TTS generation tests
- `test/voice-cli.test.ts` — voice CLI tests

## Dependencies

- Phase 1 (uses `ffmpeg/utils.ts` for `wavToMp3`, `measureAudioDuration`)
- Phase 2 (optional — only for pattern consistency)

## Backward Compatibility

- `import { generateVoiceSegments } from "./script/tts.js"` → still works
- `import { getTTSProvider } from "./script/tts.js"` → still works (re-exported)
- New consumers can `import { getTTSProvider } from "./voice/index.js"` directly
