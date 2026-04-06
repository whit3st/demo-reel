# Scripting — AI-Powered Demo Video Generation

## Vision

Instead of manually writing step-by-step `.demo.ts` config files, describe what you want to demo in natural language and get a generated scenario with voiceover narration. The output is always an editable `.demo.ts` file — not a black box.

---

## The Core Problem

Two things need to be generated and synchronized:

1. **What happens on screen** — browser automation steps with real selectors
2. **What the voice says** — narration that matches the on-screen actions

These constrain each other. The narration can't say "click the submit button" 3 seconds after the click already happened. And you can't speed up a 10-second typing animation to fit a 2-second narration pause.

---

## Workflow

The pipeline has four independent stages. Each produces an editable artifact that can be re-run in isolation.

```
describe → [1. Script] → [2. Voice] → [3. Timing] → [4. Record]
               ↓              ↓             ↓             ↓
         .script.json    narration.mp3   .demo.ts      video.mp4
```

```bash
demo-reel script generate "description" --url ...  # → .script.json
demo-reel script voice onboarding.script.json      # → narration.mp3
demo-reel script build onboarding.script.json      # → .demo.ts (timed)
demo-reel onboarding                               # → video.mp4
```

Each stage can be re-run independently. Changed the narration text for scene 3? Regenerate just the voice and re-sync timing. Selectors broke after a deploy? Edit the `.script.json` and rebuild.

### Stage 1: Script Generation

**Input:** Natural language description + app URL
**Output:** `onboarding.script.json`

```typescript
interface DemoScript {
  title: string;
  url: string;
  scenes: ScriptScene[];
}

interface ScriptScene {
  narration: string;             // What the voiceover says
  steps: Step[];                 // demo-reel steps with real selectors
  emphasis?: string;             // What to highlight visually
}
```

This is the hardest stage — see "The Selector Problem" below.

### Stage 2: Voice Generation

**Input:** `.script.json`
**Output:** `narration.mp3` (one file, concatenated from per-scene segments)

Each scene's narration text is sent to a TTS provider. Segments are concatenated with silence gaps. Per-scene audio durations are measured and written back into the script for timing.

### Stage 3: Timing Synchronization

**Input:** `.script.json` (with audio durations) + `narration.mp3`
**Output:** `onboarding.demo.ts` (a standard demo-reel config)

Uses audio-first timing: step delays are adjusted so on-screen actions align with what the voice is saying. See "The Timing Problem" below.

### Stage 4: Recording

Standard `demo-reel` recording — no special logic needed. The generated `.demo.ts` already has the audio path and timing baked in.

---

## The Selector Problem

The LLM needs to produce steps with selectors that match real elements. This is the single hardest technical challenge.

### Approach: Crawl → Generate → Validate

**Step 1: Crawl the page**

Launch Playwright, visit the URL, extract all interactive elements:

```typescript
interface CrawledElement {
  tag: string;                    // button, input, a, select, etc.
  text: string;                   // visible text / aria-label / placeholder
  selector: SelectorConfig;       // best stable selector found
  attributes: Record<string, string>;
  boundingBox: { x, y, w, h };
}
```

Selector priority: `data-testid` > `id` > unique `aria-label` > unique text content > CSS path.

**Step 2: Generate steps with real selectors**

Feed the crawled elements + user description to the LLM. The LLM picks from the available selectors — it doesn't invent them.

**Step 3: Validate with dry-run**

Execute the generated steps in a headless browser. If a step fails (element not found, timeout), re-crawl from that page state and ask the LLM to fix just the broken step.

### The page-state problem

After each navigation or click, the page changes. The crawl from step 1 is stale. Two options:

**Option A: Full step-by-step crawl** — Execute one step, re-crawl, generate the next step. Accurate but slow (LLM call per step).

**Option B: Crawl key pages upfront** — Crawl the starting URL and any URLs mentioned in the description. Generate the full script, then validate. Fix broken steps with targeted re-crawls. Faster, good enough for most cases.

Option B is the practical default. Option A could be a `--thorough` flag for complex flows.

### When selectors break

Apps change. Selectors that worked last week may not work today. Since the output is an editable `.demo.ts`, users can fix selectors by hand. But we should also support:

```bash
demo-reel script validate onboarding.script.json  # dry-run all steps, report failures
demo-reel script fix onboarding.script.json        # re-crawl + LLM fix for broken steps
```

---

## The Timing Problem

Narration and actions need to feel naturally synchronized.

### Audio-first timing strategy

1. Generate all voiceover audio segments
2. Measure actual duration of each segment (in ms)
3. Estimate step durations (typing speed × characters, movement duration, wait times)
4. Fit steps into audio windows:
   - If steps are shorter than narration: add `delayAfterMs` padding
   - If steps are longer than narration: insert silence in the audio gap
5. Write the final `.demo.ts` with all delays calculated

### Pacing rules

- Narration for a scene starts slightly before the first action (~300ms lead-in)
- Fast actions (clicks) happen during sentence breaks in narration
- Typing is visible while narration describes what's being typed
- After important visual changes (page navigation, modal open), add 1-2s pause for the viewer to absorb
- Between scenes, insert 0.5-1s of silence

### What happens when timing changes?

Regenerating audio (different voice, speed) invalidates timing. But since timing is a separate stage, you just re-run `demo-reel script build` and it recalculates everything.

---

## TTS Provider Support

```typescript
interface TTSProvider {
  name: string;
  generate(text: string, options: TTSOptions): Promise<{ audio: Buffer; durationMs: number }>;
}

interface TTSOptions {
  voice?: string;
  speed?: number;
  format?: "mp3" | "wav";
}
```

| Provider | Quality | Cost | Notes |
|----------|---------|------|-------|
| OpenAI TTS | Good | $0.015/1K chars | Good default, many voices |
| ElevenLabs | Excellent | ~$0.30/1K chars | Best quality, expensive |
| Google Cloud TTS | Good | $0.016/1K chars | Many languages |
| Local (Piper) | Decent | Free | Offline, no API key needed |

Default to OpenAI TTS for cost/quality balance. Support others via plugin interface.

### Caching

Audio generation is expensive and slow. Cache aggressively:

- Key: hash of (narration text + voice + speed)
- Store in `.demo-reel-cache/voice/`
- Only regenerate when narration text or voice settings change
- `--no-cache` flag to force regeneration

---

## CLI Interface

```bash
# Full pipeline: describe → video
demo-reel script "Show the signup flow" --url https://acme.app --output onboarding

# Individual stages
demo-reel script generate "Show the signup flow" --url https://acme.app  # → .script.json
demo-reel script voice onboarding.script.json --voice nova               # → narration.mp3
demo-reel script build onboarding.script.json                            # → .demo.ts
demo-reel onboarding                                                     # → video.mp4

# Maintenance
demo-reel script validate onboarding.script.json   # check selectors still work
demo-reel script fix onboarding.script.json         # re-crawl + fix broken selectors
```

### Config file alternative

```typescript
// onboarding.script.ts
import { defineScript } from "demo-reel";

export default defineScript({
  description: "Show how a new user signs up and creates their first project",
  url: "https://acme.app/signup",
  voice: {
    provider: "openai",
    voice: "alloy",
    speed: 1.0,
  },
  hints: [
    "Use jane@example.com as the email",
    "The password should be visible while typing",
    "Pause after project creation to show the dashboard",
  ],
  auth: {
    // Reuse existing auth config, or describe login in the description
  },
  output: {
    name: "onboarding",
    format: "mp4",
    resolution: "FHD",
  },
});
```

---

## Known Hard Problems

### 1. Dynamic content and non-determinism

Apps with random data, timestamps, A/B tests, or animated content produce different results on each run. Mitigation:

- Use `preSteps` to seed deterministic state
- Use `evaluate` step (once implemented) to mock APIs or set feature flags
- Accept that some variation is unavoidable

### 2. Complex multi-step flows

The LLM doesn't inherently know that clicking "New Project" opens a modal with three required fields, or that form submission triggers a redirect. The crawl helps, but deep multi-step flows with conditional logic are hard to script automatically.

Mitigation: The `hints` field lets users guide the LLM through tricky flows. For very complex scenarios, generating the script is a starting point for manual editing, not the final product.

### 3. Authentication

Demos usually require being logged in. Options:

- Reuse existing `auth` config — script generator skips login
- Include login in the description — script generator creates login steps
- Separate concern — auth is always configured independently

Recommend: auth is always separate config. The script generator focuses on the demo flow, not login.

### 4. Cost accumulation

Each script generation needs LLM calls. Each voiceover needs TTS calls. Iterating gets expensive. Mitigation:

- Cache voice segments (only regenerate changed narration)
- Cache crawl results (invalidate on URL change)
- `--dry-run` to preview script without generating voice/video
- Local TTS option (Piper) for development iteration

### 5. App-specific knowledge gaps

The LLM may not understand domain-specific UI patterns (custom date pickers, drag-and-drop builders, canvas-based editors). These require manual step authoring. The scripting pipeline should gracefully handle mixed auto-generated and hand-written steps.

---

## What This Is and Isn't

**This is:** A tool that gets you 80% of the way to a demo video from a natural language description, producing editable artifacts you can refine.

**This is not:** A fully autonomous system that produces perfect videos without human review. The generated `.demo.ts` is a starting point. Expect to tweak selectors, adjust timing, and edit narration text.

The value is in dramatically reducing the time from "I want a demo" to "I have a working first draft" — from hours of manual config authoring to minutes of description + review.

---

## Implementation Order

1. **DOM Crawler** — Playwright-based element extraction with selector ranking
2. **Script Generator** — LLM integration with crawl context, structured output
3. **Dry-run Validator** — Execute steps headlessly, report failures
4. **TTS Integration** — Provider abstraction, per-scene generation, caching
5. **Timing Engine** — Audio-first timing calculation, delay injection
6. **Scenario Assembler** — Generate `.demo.ts` from timed script
7. **CLI Commands** — Wire up `demo-reel script` subcommands

---

## Dependencies

- **LLM** — Claude API for script generation (structured output with tool use)
- **TTS** — OpenAI TTS SDK (default), provider plugin interface for alternatives
- **FFmpeg** — Already a dependency, used for audio concatenation and silence insertion
- **Playwright** — Already a dependency, used for DOM crawling and validation
