You are helping the user create a demo video script for their web application. Walk through this process interactively, step by step. Do NOT rush — get user confirmation at each stage before proceeding.

## Step 1: Gather Requirements

Ask the user for:
- **URL**: The starting URL of their web app (if not already provided as $ARGUMENTS)
- **Description**: What should the demo show? (if not already provided)
- **Hints**: Any specific data to use (emails, names), things to emphasize, or constraints

If the user provided arguments, parse them. Example: `/demo-script https://myapp.com Show the signup flow`

## Step 2: Crawl the Page

Run the DOM crawler to discover interactive elements:

```bash
npx tsx src/script/crawl-cli.ts <URL>
```

Show the user a summary of what was found (page title, headings, key interactive elements). Ask if this looks right or if they need to navigate to a different page first.

## Step 3: Generate the Script

Using the crawled DOM context and the user's description, generate a `DemoScript` JSON object with scenes. Each scene has:
- `narration`: What the voiceover says (conversational, professional, 1-3 sentences)
- `steps`: demo-reel automation steps using ONLY selectors from the crawled context
- `emphasis`: Optional visual focus note

CRITICAL: Only use selectors that appeared in the crawl output. Never invent selectors.

Present each scene to the user in a readable format like:

```
Scene 1: "Welcome to Acme — let's walk through creating your first project."
  → goto https://acme.app
  → wait 2000ms

Scene 2: "First, we'll click the New Project button in the top right."
  → click [testId: "new-project-btn"]
  → waitFor selector [id: "project-name"] visible
```

Ask: "How does this look? Want to change any scenes, add steps, or adjust the narration?"

## Step 4: Iterate

If the user wants changes, apply them and show the updated script. Common requests:
- "Make the narration more casual/formal"
- "Add a pause after step X"
- "Skip the login part"
- "Use a different email address"
- "Add a scene showing the settings page"

If a new page needs to be crawled (user wants to demo a page we haven't seen), run the crawler on that URL.

## Step 5: Write the Script File

Once the user approves, write the script to `<name>.script.json`:

```json
{
  "title": "...",
  "description": "...",
  "url": "...",
  "scenes": [...]
}
```

Use the Write tool to create the file. Ask the user what to name it (default: `demo`).

## Step 6: Voice Generation (Optional)

Ask: "Want to generate voiceover audio? This requires an OpenAI API key (OPENAI_API_KEY env var)."

If yes, run:
```bash
npx tsx src/script/voice-cli.ts <name>.script.json --voice alloy
```

Available voices: alloy, echo, fable, onyx, nova, shimmer

## Step 7: Build the Scenario

After voice generation (or if skipping voice), build the .demo.ts:

```bash
npx demo-reel script build <name>.script.json
```

Or if voice was skipped, use the Write tool to generate a .demo.ts manually from the script, using the assembler logic (define the config with steps, presets, and optionally audio).

## Step 8: Record (Optional)

Ask: "Ready to record the video? Run `npx demo-reel <name>` to generate it."

If the user says yes, run:
```bash
npx demo-reel <name> --verbose
```

## Guidelines

- Be concise in your narration — demos should be 30-90 seconds
- Use natural language: "Let's", "Notice how", "We'll", "Here you can see"
- Add `delayAfterMs` on steps that trigger visual changes (500-1500ms) so viewers can see the result
- Add `wait` steps (1000-2000ms) after page navigations
- Always use the `waitFor` step after clicks that trigger navigation or loading
- Prefer `data-testid` selectors, fall back to `id`, then `href`, then `class`
