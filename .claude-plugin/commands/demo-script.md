You are helping the user create a demo video script for their web application. This is a collaborative process — you figure out the flow together, then build the script scene by scene.

## Modular Video Series Pattern

Demo videos are designed as **modular, standalone segments** that also work together as a guided journey. Each video:

1. **Is fully independent** — has its own preSteps that set up the required state from scratch (login, create tenant, create template, etc.), even if a previous video already did that
2. **Opens with brief context** (~3-5 seconds narration) — "We hebben een template aangemaakt — laten we varianten toevoegen" so standalone viewers aren't lost
3. **Covers one focused topic** — 30-90 seconds, one clear goal
4. **Ends on the result** — the viewer sees the accomplished outcome

This means preSteps for later videos in a series may need to quickly recreate what earlier videos demonstrated. For example, a "theming" video would create a tenant + template off-screen before recording the theming flow.

### Example series structure:

```
01-create-template.demo.ts
  preSteps: login → create tenant
  recorded: navigate to templates → create template → open editor

02-add-variants.demo.ts
  preSteps: login → create tenant → create template (fast, off-screen)
  recorded: open template → add variants → show variant list

03-editor-walkthrough.demo.ts
  preSteps: login → create tenant → create template (fast, off-screen)
  recorded: open editor → drag blocks → edit text → preview

04-theming.demo.ts
  preSteps: login → create tenant → create template (fast, off-screen)
  recorded: navigate to themes → create theme → apply to template
```

## Step 1: Understand the Goal

The user will describe a goal like "show users how to add a variant of a template" or "demo the onboarding flow for new users."

Ask clarifying questions to understand:
- **Who is the audience?** New users? Existing customers? Potential buyers?
- **What's the starting point?** Where in the app does this flow begin?
- **What's the end state?** What should the viewer see at the end?
- **Any specifics?** Test data (emails, names, project names), things to emphasize, things to skip
- **Tone and language?** Casual/formal, which language for narration and content
- **Part of a series?** Does this build on previous demos? What state already exists?

If the user provided $ARGUMENTS, treat it as the goal description and ask follow-up questions.

## Step 2: Explore the App

Before writing any script, explore the app to understand what's available. Use the exploration script to log in and crawl the relevant pages:

```bash
node --import tsx/esm src/script/explore.ts <base-url> --user <user> --pass <pass>
```

For specific pages, write a quick inline exploration script that logs in, clicks through to the target page, and extracts elements. Always **click through the UI** rather than navigating by URL — SPAs often break with direct URL navigation.

Summarize what you find for the user — page structure, available actions, selectors.

## Step 3: Identify Setup vs. Recorded Steps

Some steps need to happen before recording starts. These are **preSteps** and **auth**: they run but aren't captured in the video.

Ask the user: "Is there anything we need to do before the recording starts?"

Common preSteps:
- Login flow → use the `auth` block with `loginSteps`, `validate`, `storage`
- Create a fresh tenant/workspace → keeps demos reproducible and independent
- Create prerequisite data (templates, users, etc.) that this video builds upon
- Navigate past landing pages to the actual starting point
- Dismiss cookie banners or onboarding modals

For a video series, later videos need heavier preSteps that recreate earlier videos' outcomes off-screen.

## Step 4: Plan the Recorded Flow

Before crawling anything, sketch the high-level flow together. Example:

```
Goal: Show users how to add a variant of a template

Flow:
1. Start at the template detail page (context intro)
2. Click "Add Variant"
3. Fill in the variant details
4. Save → show the variant in the list
```

Present this to the user and ask: "Does this flow make sense? Anything missing or out of order?"

## Step 5: Build Scenes (Page by Page)

Work through the flow one page at a time.

### For each page:

**a) Crawl it** — If not already explored, write a quick script that logs in, clicks through to the page, and extracts interactive elements. Always click links in the SPA rather than using direct URL navigation.

Summarize what you see. Highlight elements relevant to the current step.

**b) Draft scene(s):**

```
Scene 2: "Laten we een nieuw template aanmaken voor een ontvangstbevestiging bij klachten."
  → click [href: "/tenants/demo-klacht/templates/new"]
  → waitFor [id: "slug"] visible
  → type slug: "ontvangstbevestiging-klacht"
  → type name: "Ontvangstbevestiging Klacht"
```

CRITICAL: Only use selectors that appeared in the crawl output. Never invent selectors. Always prefer clicking elements over navigating by URL.

**c) Get feedback** — "How's this? Want to adjust the narration or steps?"

**d) Move to the next page** — "What happens after this?"

If you need to discover what a button does, write a script that clicks it and reports the result.

## Step 6: Review the Full Script

Show the complete script as a numbered scene list. The user can:
- Reorder, cut, or merge scenes
- Tighten narration
- Adjust pacing
- Add emphasis

Ask: "Here's the full script. Want to change anything before we save it?"

## Step 7: Save

Ask for a name (default: based on the goal, e.g., `create-template`). Write:

1. **`<name>.script.json`** — The structured script with scenes, narration, and steps
2. **`<name>.demo.ts`** — Ready-to-run demo-reel config with:
   - `defineConfig` import from `"demo-reel"`
   - Presets: `cursor: "dot"`, `motion: "smooth"`, `typing: "humanlike"`, `timing: "normal"`
   - `outputFormat: "mp4"` if voice will be added later
   - `auth` block for login (with `loginSteps`, `validate`, `storage`)
   - `preSteps` array for all setup (tenant creation, data setup, navigation)
   - Scene comments above each group of steps
   - Appropriate `delayAfterMs`, `wait`, and `waitFor` steps for natural pacing

## Step 8: Record

Build the project first if needed: `pnpm exec tsc --outDir dist`

Then run: `node dist/cli.js <name> --verbose`

Note: Run from compiled `dist/` to avoid tsx transform issues with browser-injected scripts.

If it fails, help debug — write a script that clicks through to the failing page, find the broken selector, fix together.

## Step 9: Voice (Optional)

Ask: "Want to add voiceover? You'll need OPENAI_API_KEY set."

If yes, pick a voice (alloy/echo/fable/onyx/nova/shimmer) and run:
```bash
node --import tsx/esm src/script/voice-cli.ts <name>.script.json --voice <voice>
```

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

**Selectors:** `data-testid` > `id` > `href` > unique `class` > `custom`

**Navigation:** Always click elements in the UI. Never use `goto` for internal SPA pages — only for the initial page load or external URLs.

**Scene structure:**
- Each scene = one logical beat, not one page
- A complex page might have 2-3 scenes
- Simple transitions can be one scene
- First scene: brief context intro for standalone viewers
- Last scene: linger on the result
