# Voice Module

## Purpose

TTS (Text-to-Speech) provider abstraction for generating voiceover narration audio. Three interchangeable providers, caching by content hash, and text pre-processing with pronunciation overrides. Extracted from `script/tts.ts` (587 lines → 6 focused files).

## Location

`src/voice/`

## Files

| File            | Purpose                                        |
| --------------- | ---------------------------------------------- |
| `index.ts`      | `TTSProvider` interface + provider registry    |
| `piper.ts`      | Piper provider (local, free, no API key)       |
| `openai.ts`     | OpenAI TTS provider (cloud, requires API key)  |
| `elevenlabs.ts` | ElevenLabs provider (cloud, curated voices)    |
| `cache.ts`      | Voice audio caching by content hash            |
| `types.ts`      | `VoiceSegment`, `VoiceGenerationOptions`, etc. |

## Provider Interface

```ts
export interface TTSProvider {
  readonly name: string;
  generate(text: string, options: VoiceConfig): Promise<{ audio: Buffer; durationMs: number }>;
}
```

Every provider:

- Has a unique `name`
- Accepts text + voice config → returns raw audio buffer + duration
- Is stateless (no per-session state)

## Provider Registry

```ts
const providers = new Map<string, TTSProvider>();

export function registerProvider(provider: TTSProvider): void;
export function getProvider(name: string): TTSProvider | undefined;
export function getAvailableProviders(): string[];
```

Providers are registered by name. The `voice-config.ts` resolves which provider to use based on `config.voice.provider`.

## Providers

### Piper (`piper.ts`)

| Property    | Value                                   |
| ----------- | --------------------------------------- |
| **Name**    | `"piper"`                               |
| **Cost**    | Free                                    |
| **Network** | Offline (local binary + model download) |
| **Quality** | Good (neural TTS)                       |
| **Models**  | Community-trained on HuggingFace        |

**How it works:**

1. Downloads Piper binary (`~/.demo-reel/piper/piper`) if not cached
2. Downloads voice model (`.onnx` + `.json`) if not cached
3. Runs `piper --model <model.onnx> --output_file <out.wav>` as child process
4. Reads WAV output → buffer

**Binary path:** `~/.demo-reel/piper/piper`
**Model path:** `~/.demo-reel/piper/models/<voice>.onnx`

### OpenAI (`openai.ts`)

| Property    | Value                       |
| ----------- | --------------------------- |
| **Name**    | `"openai"`                  |
| **Cost**    | Per-character pricing       |
| **Network** | Requires internet + API key |
| **Quality** | High (GPT-4o voices)        |

**How it works:**

1. Uses `OPENAI_API_KEY` environment variable
2. Calls OpenAI TTS API: `POST https://api.openai.com/v1/audio/speech`
3. Model: `tts-1` or `tts-1-hd`
4. Returns MP3/Opus audio buffer

**Voices:** alloy, echo, fable, onyx, nova, shimmer

### ElevenLabs (`elevenlabs.ts`)

| Property    | Value                                      |
| ----------- | ------------------------------------------ |
| **Name**    | `"elevenlabs"`                             |
| **Cost**    | Per-character pricing                      |
| **Network** | Requires internet + API key                |
| **Quality** | Very high (custom voice cloning available) |

**How it works:**

1. Uses `ELEVENLABS_API_KEY` environment variable
2. Calls ElevenLabs TTS API: `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}`
3. Returns MP3 audio buffer

**Voice IDs:** Curated list of high-quality voice IDs (e.g., `21m00Tcm4TlvDq8ikWAM` for "Rachel")

## Voice Cache (`cache.ts`)

```ts
export async function getCachedVoice(
  text: string,
  voice: string,
  provider: string,
): Promise<Buffer | null>;
export async function cacheVoice(
  text: string,
  voice: string,
  provider: string,
  audio: Buffer,
): Promise<void>;
export function buildCacheKey(text: string, voice: string, provider: string): string;
```

**Cache mechanism:**

1. Hash input: `SHA256(text + voice + provider + processing_version)`
2. Store in `~/.demo-reel/cache/voice/<hash>.mp3`
3. Check cache before generating new audio
4. Cache versioned by `NARRATION_PROCESSING_VERSION`

This avoids re-generating the same narration audio when re-running the same demo.

## Voice Generation Pipeline

```ts
export async function generateVoiceSegments(
  script: DemoScript,
  voice: VoiceConfig,
  options?: { verbose?: boolean },
): Promise<VoiceSegment[]>;

export async function generateNarrationAudio(
  segments: VoiceSegment[],
  outputPath: string,
  options?: { verbose?: boolean },
): Promise<void>;
```

**Segment generation:**

1. For each scene with narration:
   - Apply pronunciation replacements if configured
   - Check cache → generate if missing
   - Save individual scene MP3 to clips directory
2. Return `VoiceSegment[]` with per-scene audio metadata

**Narration assembly:**

1. Concatenate all scene MP3s into single audio track using FFmpeg
2. Generate `narration-manifest.json` with clip metadata
3. Both files go alongside the output video

## Pronunciation Overrides

```json
{
  "voice": {
    "provider": "piper",
    "pronunciation": {
      "template": "templayt",
      "editor": "èditor"
    }
  }
}
```

Before generating audio, the text is processed:

1. Split into words
2. Replace matching words with pronunciation overrides
3. Join back into processed text

This allows correcting TTS mispronunciations without editing the narration text.

## Current → New Mapping

| Current                                              | New                                          |
| ---------------------------------------------------- | -------------------------------------------- |
| `script/tts.ts :: TTSProvider`                       | `voice/index.ts :: TTSProvider`              |
| `script/tts.ts :: generateVoiceSegments()`           | `voice/index.ts :: generateVoiceSegments()`  |
| `script/tts.ts :: generateNarrationAudio()`          | `voice/index.ts :: generateNarrationAudio()` |
| `script/tts.ts :: getPiperTTSProvider()`             | `voice/piper.ts :: PiperProvider`            |
| `script/tts.ts :: getOpenAITTSProvider()`            | `voice/openai.ts :: OpenAIProvider`          |
| `script/tts.ts :: getElevenLabsTTSProvider()`        | `voice/elevenlabs.ts :: ElevenLabsProvider`  |
| `script/tts.ts :: getCachedVoice()` / `cacheVoice()` | `voice/cache.ts`                             |
| `script/tts.ts :: applyPronunciation()`              | `voice/index.ts :: applyPronunciation()`     |
| `piper.ts` (top-level)                               | `voice/piper.ts` (moved + provider-ized)     |
