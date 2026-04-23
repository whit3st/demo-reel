# Track CLI

`demo-reel track --name=<name>` records a browser session into `<name>.track.json`.

The goal is speed without dumping every low-level browser event into the final file. `track` captures raw browser activity internally, then normalizes it before writing the final `.track.json` so AI gets a much cleaner artifact.

## CLI

```bash
demo-reel track --name=create-template
demo-reel track --name=create-template --url=app.example.com/templates
demo-reel track --name=create-template --session=my-app --url=app.example.com/templates
```

Behavior:

- Opens a headed Chromium browser via Playwright
- Navigates to `--url` first when provided. If the URL has no scheme, `https://` is prepended automatically.
- Prints the normalized URL it opened so you can verify the starting point immediately.
- Captures browser `navigation`, `click`, `input`, `keydown`, `change`, and `scroll` events
- Supports terminal controls: `r` resume, `p` pause, `q` stop
- When `--session <name>` is provided, `track` starts paused and also supports `s` to save the current auth session
- Writes `create-template.track.json` to the current working directory

## Normalization

Before the file is written, `track` normalizes the captured events:

- Consecutive scroll events are collapsed to the final position in each burst
- Typing bursts are collapsed to final field values
- Modifier-only keyboard noise is dropped
- Duplicate navigation bursts are reduced to the final URL transition
- Weak selectors are upgraded when a stronger button, link, input, or accessible selector is available

This keeps the saved file much closer to the user intent the AI actually needs.

## Auth-Safe Recording

Login flows are usually bad recording material because they can leak credentials and add noisy events that distract the AI from the real demo flow.

Use `--session <name>` to avoid that.

Example:

```bash
demo-reel track --name=create-template --session=my-app --url=app.example.com/templates
```

Flow:

1. `track` opens paused
2. Log in manually
3. Press `s` to save the session to `.demo-reel-sessions/my-app.json`
4. Press `r` to start recording the actual demo flow

On later runs, `track` restores the saved session before you start recording.

As defense in depth, sensitive input values are redacted in the raw event stream when the recorder detects password-like fields.

## Output Shape

Each track file is JSON with this top-level structure:

```json
{
  "version": 1,
  "source": "demo-reel track",
  "name": "create-template",
  "browser": "chromium",
  "startedAt": "2026-04-22T12:00:00.000Z",
  "endedAt": "2026-04-22T12:00:08.500Z",
  "meta": {
    "openedUrl": "https://app.example.com/templates",
    "startedPaused": false,
    "sessionLoaded": false,
    "rawEventCount": 128,
    "normalizedEventCount": 24
  },
  "eventCount": 4,
  "events": []
}
```

## Event Types

### `navigation`

```json
{
  "type": "navigation",
  "timeOffsetMs": 0,
  "pageId": "page-1",
  "url": "https://app.example.com/templates"
}
```

### `click`

```json
{
  "type": "click",
  "timeOffsetMs": 1840,
  "pageId": "page-1",
  "url": "https://app.example.com/templates",
  "button": "left",
  "x": 742,
  "y": 188,
  "target": {
    "selector": { "strategy": "testId", "value": "create-template" },
    "element": {
      "tag": "button",
      "text": "Create template",
      "role": "button",
      "attributes": {
        "data-testid": "create-template"
      }
    }
  }
}
```

### `input`

```json
{
  "type": "input",
  "timeOffsetMs": 2630,
  "pageId": "page-1",
  "url": "https://app.example.com/templates/new",
  "value": "Homepage template",
  "inputType": "insertText",
  "target": {
    "selector": { "strategy": "id", "value": "name" },
    "element": {
      "tag": "input",
      "text": "Template name",
      "role": "input",
      "attributes": {
        "id": "name",
        "type": "text"
      },
      "value": "Homepage template"
    }
  }
}
```

Typing is normalized, so the saved file usually contains the final value for a field edit burst instead of every intermediate keypress.

### `keydown`

```json
{
  "type": "keydown",
  "timeOffsetMs": 2710,
  "pageId": "page-1",
  "url": "https://app.example.com/templates/new",
  "key": "Enter",
  "code": "Enter",
  "target": {
    "selector": { "strategy": "id", "value": "name" },
    "element": {
      "tag": "input",
      "text": "Template name",
      "role": "input",
      "attributes": {
        "id": "name",
        "type": "text"
      }
    }
  }
}
```

### `change`

Used for things like selects, checkboxes, radios, and other control state changes.

### `scroll`

`scope` is either `window` or `element`.

## Selector Semantics

`target.selector` uses the same selector heuristics already used elsewhere in `demo-reel`:

1. `testId`
2. `id`
3. `href` for links
4. `data-node-id`
5. `class` when it looks stable enough
6. `custom` fallback

The selector is best-effort only. AI can rewrite it if a better selector is obvious from the raw `element.attributes` snapshot.

## Guidance For AI

When converting a `.track.json` file into a `demo-reel` config:

1. Treat the file as raw intent, not polished output.
2. Prefer `click`, `type`, `press`, `select`, `check`, `scroll`, `goto`, and `wait` steps in the final config.
3. Merge noisy `keydown` + `input` sequences into a single `type` step when they clearly belong to text entry.
4. Keep important `keydown` events like `Enter`, `Tab`, `Escape`, arrows, or command shortcuts as `press` steps.
5. Add `wait` or `delayAfterMs` where the captured flow obviously needs breathing room.
6. Group related event ranges into scenes and add narration after the config is runnable.
7. If a selector looks weak, use `target.element.attributes` and nearby context to upgrade it.

## Notes

- Track files are normalized for AI, not a byte-for-byte raw browser log. Avoid recording secrets unless necessary, even though obvious password-like fields are redacted.
- Timing is raw and may be noisy. AI is expected to refine it.
- `track` still does not try to emit final `demo-reel` steps directly. It produces a cleaner intermediate artifact for AI conversion.
