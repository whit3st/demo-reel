# Demo Reel — Development Plan

Current version: 0.1.4

This plan covers the remaining work needed to produce polished, production-quality demo videos.

---

## Phase 1: Config Loading Reliability

### TypeScript config loader

`config-loader.ts` uses `import(pathToFileURL(...))` for `.ts` files, which only works if the user has `tsx` or a similar Node loader registered. This should either:

- Bundle `tsx` as a dependency and spawn with `--import tsx/esm`, or
- Document the requirement explicitly in README and error messages

---

## Phase 2: Visual Polish

### Click ripple effect

Inject a brief visual ripple animation at the click point. This makes it obvious where clicks happen in the video. Implement as a CSS animation injected alongside the cursor overlay.

### Text overlay / callout step

Add a new `annotate` step type that renders a floating text label or highlight box on screen for a configurable duration. Useful for "Step 1: Click here" style narration in the video itself.

### Zoom-to-element

Add a `zoom` step that smoothly scales the viewport to focus on a specific element, then zooms back out. Helps viewers see small UI details.

---

## Phase 3: Step Enhancements

### `evaluate` step

Add an `evaluate` step type that runs arbitrary JavaScript in the page context. Useful for:

- Injecting mock data or API responses
- Triggering toast notifications
- Changing themes or toggling feature flags
- Any setup that isn't a standard browser interaction

### Error recovery

Add `continueOnError` (boolean) to the step schema. When true, a failed step logs a warning but doesn't abort the scenario. Optionally add `retries` (number) for flaky steps.

---

## Phase 4: Device Emulation

### Mobile / tablet viewports

Pass Playwright device descriptors through config:

```typescript
device: "iPhone 14"
// or
viewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
```

This enables demoing responsive designs and mobile-specific flows without separate tooling.

---

## Phase 5: Scene Composition

### Multi-scene scenarios

Allow a scenario to define multiple `scenes`, each with their own steps. Scenes are recorded separately and stitched together with configurable transitions (cut, fade, crossfade).

### Intro / outro frames

Add `intro` and `outro` config sections that render a static title card (text, background color, duration) at the start/end of the video. Useful for branding.

---

## Phase 6: CI/CD & Distribution

### GitHub Action

Create `action.yml` for GitHub Marketplace:

- Inputs: `config-path`, `output-dir`, `upload-artifacts`, `comment-pr`
- Automatically install Playwright browsers
- Post video links as PR comments

### GIF export

Add `outputFormat: "gif"` with configurable fps, width, and color palette. GIFs are useful for READMEs, issue descriptions, and social media.

---

## Phase 7: Advanced Features

### Parallel execution

Run multiple `.demo.ts` scenarios concurrently with configurable concurrency limits. Important for CI pipelines with many scenarios.

### Interactive recording mode

Browse the app manually while recording, then auto-generate a `.demo.ts` config from the recorded actions. Lowers the barrier to creating the first scenario.

### Subtitle generation

Auto-generate SRT/VTT files from narration audio timestamps or from step annotations. Important for accessibility.

---

## Priority Summary

| Phase | Focus | Impact |
|-------|-------|--------|
| 1 | Config loading | Unblocks basic usage |
| 2 | Visual polish | Makes videos look professional |
| 3 | Step enhancements | Covers more demo scenarios |
| 4 | Device emulation | Mobile product demos |
| 5 | Scene composition | Multi-part narratives |
| 6 | CI/CD & distribution | Automation and sharing |
| 7 | Advanced features | Power users and scale |
