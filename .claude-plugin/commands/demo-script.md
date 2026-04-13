You are helping the user create a demo video script for their web application. This is a collaborative process — you figure out the flow together, then build the script scene by scene.

## Modular Video Series Pattern

Demo videos are designed as **modular, standalone segments** that also work together as a guided journey. Each video:

1. **Is fully independent** — has its own setup steps that create required state from scratch (login, create tenant, create template, etc.)
2. **Opens with brief context** (~3-5 seconds narration) — "We hebben een template aangemaakt — laten we varianten toevoegen" so standalone viewers aren't lost
3. **Covers one focused topic** — 30-90 seconds, one clear goal
4. **Ends on the result** — the viewer sees the accomplished outcome

### Example series structure:

```
01-create-template.demo.ts
  setup: login → create tenant
  recorded: navigate to templates → create template → open editor

02-add-variants.demo.ts
  setup: login → create tenant → create template (fast, off-screen)
  recorded: open template → add variants → show variant list

03-editor-walkthrough.demo.ts
  setup: login → create tenant → create template (fast, off-screen)
  recorded: open editor → drag blocks → edit text → preview
```

## Step 1: Understand the Goal

Ask clarifying questions to understand:

- **Who is the audience?** New users? Existing customers? Potential buyers?
- **What's the starting point?** Where in the app does this flow begin?
- **What's the end state?** What should the viewer see at the end?
- **Any specifics?** Test data (emails, names, project names), things to emphasize, things to skip
- **Tone and language?** Casual/formal, which language for narration and content
- **Part of a series?** Does this build on previous demos? What state already exists?

If the user provided $ARGUMENTS, treat it as the goal description and ask follow-up questions.

## Step 2: Explore the App

Before writing any script, explore the app. Use the explore command:

```bash
pnpm demo-reel explore <url>
```

For authenticated pages, write a quick inline exploration script that logs in, clicks through to the target page, and extracts elements. Always **click through the UI** rather than navigating by URL — SPAs often break with direct URL navigation.

Summarize what you find for the user — page structure, available actions, selectors.

## Step 3: Identify Setup vs. Recorded Steps

Some steps need to happen before recording starts. These are **setup** and **auth**: they run but aren't captured in the video (they run in a separate browser).

Ask the user: "Is there anything we need to do before the recording starts?"

Common setup steps:

- Login flow → use the `auth` block with `loginSteps`, `validate`, `storage`
- Create a fresh tenant/workspace → keeps demos reproducible and independent
- Create prerequisite data (templates, users, etc.) that this video builds upon
- Navigate past landing pages to the actual starting point

Also identify **cleanup** steps that should run after recording (e.g., delete tenant).

## Step 4: Plan the Recorded Flow

Before crawling anything, sketch the high-level flow together. Present it and ask: "Does this flow make sense?"

## Step 5: Build Scenes (Page by Page)

Work through the flow one page at a time.

**a) Crawl it** — explore the page, extract interactive elements. Always click links in the SPA.

**b) Draft scene(s):**

```
Scene 2: "Laten we een nieuw template aanmaken."
  → hover [href: "/tenants/demo/templates"]
  → click [href: "/tenants/demo/templates"]
  → wait 1500ms
```

CRITICAL: Only use selectors from the crawl output. Never invent selectors. Always hover before clicking for natural cursor movement.

**c) Get feedback** — "How's this? Want to adjust the narration or steps?"

**d) Move to the next page** — "What happens after this?"

## Step 6: Review the Full Script

Show the complete script. The user can reorder, cut, merge, tighten narration, adjust pacing.

## Step 7: Save

Ask for a name. Write the `.demo.ts` config:

```typescript
import { demo } from 'demo-reel';

export default demo({
  video: { resolution: "FHD" },
  cursor: "dot",
  motion: "smooth",
  typing: "humanlike",
  timing: "normal",
  outputFormat: "mp4",
  name: "create-template",
  outputDir: "./output",

  voice: {
    provider: "elevenlabs",
    voice: "CwhRBWXzGAHq8TQ4Fs17",
    pronunciation: { "template": "template" },
  },

  auth: { /* loginSteps, validate, storage */ },
  setup: [ /* steps to run before recording */ ],
  cleanup: [ /* steps to run after recording */ ],

  scenes: [
    { narration: "...", stepIndex: 0, isIntro: true },
    { narration: "...", stepIndex: 3 },
  ],

  steps: [
    // Scene 1: ...
    { action: "hover", selector: { ... }, delayAfterMs: 800 },
    { action: "click", selector: { ... }, delayAfterMs: 1500 },
    // Scene 2: ...
    { action: "type", selector: { ... }, text: "...", delayAfterMs: 300 },
  ],
});
```

Key points:

- Use `demo()` (or `defineConfig()`) from `'demo-reel'`
- `setup` = steps before recording (off-screen), `cleanup` = steps after recording
- `voice` config inline — voiceover is auto-generated during recording
- `voice` values are provider-specific:
- `piper`: `nl_NL-mls-medium`, `en_US-amy-medium`
- `openai`: `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`
- `elevenlabs`: `21m00Tcm4TlvDq8ikWAM`, `5zhopMftSdRGaPYVcwKK`
- for a custom Piper model, use `voicePath` instead of `voice`
- `scenes` map narration text to step indices for subtitles + metadata
- Always `hover` before `click` for natural cursor movement

## Step 8: Record

One command does everything (compile, voice, record, subtitles, cleanup):

```bash
pnpm demo-reel <name> --verbose
```

This compiles the .demo.ts, generates voiceover (if voice config + narration present), runs the recording in Docker, and outputs video + subtitles + metadata.

For local debugging with a visible browser:

```bash
pnpm demo-reel-local <name> --headed --verbose
```

If it fails, check `output/debug/step-N-failure.png` for a screenshot of the page at the failed step.

---

## Writing Guidelines

**Narration:**

- Goal-oriented — explain what we're trying to accomplish, not just what we're clicking
- Concise — 1-3 sentences per scene, 30-90 seconds total
- Conversational — "Let's", "Notice how", "Here's where we" (or Dutch equivalents)
- No filler — cut "As you can see" and "Now we're going to"
- Value-focused — "This saves you from having to..." not just "Click here"
- For series: open with brief context so standalone viewers aren't lost

**Pacing:**

- `delayAfterMs: 500-1500` after visual changes
- `wait: 1500-2500` after page navigations
- `waitFor` after clicks that trigger loading
- Longer pauses at "aha" moments
- Quick pace through routine steps (form filling)
- Always `hover` before `click` — shows cursor movement

**Selectors:** `data-testid` > `id` > `href` > unique `class` > `custom`

**Navigation:** Always click elements in the UI. Never use `goto` for internal SPA pages — only for the initial page load after setup.

**Scene structure:**

- Each scene = one logical beat, not one page
- First scene: brief context intro for standalone viewers
- Last scene: linger on the result
