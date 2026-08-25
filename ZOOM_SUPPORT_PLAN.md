# Plan: Zoom & Mouse-Follow Camera (`video.zoom` + `zoom` step)

Goal: demo-reel can render Screen-Studio-style demos — the frame zooms to a
configurable percentage and follows the synthetic pointer while it moves, then
returns to full view. Implemented as an **in-page virtual camera** driven by the
runner during recording, so every output format (mp4/webm/gif) inherits it for
free.

## Decisions locked

| Question         | Decision                                                                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture     | **A — In-page virtual camera** (live CSS zoom during recording), not post-production ffmpeg zoompan                                                   |
| Triggers         | **C — Hybrid**: explicit `zoom` step ships first; `mode: "auto"` layers on top as config policy                                                       |
| Follow semantics | **B — Anchor at rest, dead-zone follow in flight**: center the target on engage, then eased catch-up only when the pointer leaves a central dead-zone |
| Zoom mechanism   | **A — CSS `zoom`** (browser-zoom semantics), gated behind a spike; `transform: scale` and CDP `setPageScaleFactor` documented as fallbacks            |
| Config shape     | **C — Layered**: `video.zoom` global defaults ← scene overrides ← step parameters                                                                     |

## How the runner works today (integration points)

```
runDemo(page, config)                      src/runner/index.ts
 ├─ installCursorOverlay(page, cursor)     once, before stepping
 ├─ per step:
 │   ├─ ensureCursorOverlay(page)          re-installs after navigations
 │   ├─ scene boundary stamping            Date.now() − recordingStart
 │   └─ runStepSimple / confirm handling   src/runner/step-simple.ts
 ├─ pointer motion                          src/runner/motion.ts (bezier + easingLookup)
 └─ element rects                           locator.boundingBox() (src/runner/utils.ts)
```

Facts the design relies on:

- The runner owns the pointer and knows each step's **target before it acts** —
  anticipatory zooms are possible live.
- Scene timestamps come off the wall clock relative to `recordingStart`;
  narration placement reconciles against _measured_ recorded timestamps plus
  pre-roll (v0.12 work). Camera animation time therefore lands safely in the
  timeline without touching any timing code.
- Recording is Playwright's native webm; whatever the page shows is what gets
  encoded — including GIF exports.

## Milestone 0 — Spike (gate before building)

A throwaway script, promoted to regression tests if it passes. Must answer:

1. **CDP input coordinates vs CSS zoom.** Apply `document.documentElement.style.zoom = 2`,
   then via Playwright click elements near viewport edges, type into inputs,
   and drag. Assert the intended elements receive the events.
2. **Cursor overlay alignment.** The overlay clamps positions with
   `window.innerWidth/innerHeight` (`src/runner/cursor.ts`). Verify the rendered
   cursor still sits under the real pointer while zoomed; expected fix: scale
   clamp math by the active zoom factor.
3. **Hit-testing inside iframes** while the top document is zoomed.

If (1) fails irrecoverably → fall back to CDP `setPageScaleFactor`; if that
fails → `transform: scale` with fixed-position caveats. Do not start M1 until
one mechanism is proven.

## Milestone 1 — Camera engine + explicit `zoom` step

### `src/runner/camera.ts` (new)

Injected script following the `cursor.ts` pattern (install once +
`ensureCameraOverlay` after every navigation), exposing a small page-side API:

```ts
window.__dshCamera = {
  engage(rect | point, percent),  // eased zoom-in, anchored on target
  follow(x, y),                   // called from the pointer loop
  disengage(),                    // eased return to 100% + scroll restore
  state(),                        // for assertions/tests
};
```

Engine rules:

- Zoom rides on **CSS `zoom`** on the root; panning is **real scrolling**
  (browser-zoom semantics: enlarged layout, scrolled viewport).
- All motion decisions come from a **pure function**
  (`decidePan(camera, pointer, cfg) → scrollTarget`): dead-zone test, pan-speed
  cap, eased catch-up reusing `motion.ts`'s easing lookup. Pure ⇒ unit-testable
  without a browser.
- `disengage()` restores zoom _and_ the pre-engage scroll position.
- Animations run on rAF inside the page; durations derived from `leadMs` /
  `settleMs`.

### Schema additions

- `src/schemas/steps.ts`: new action —

  ```ts
  { action: "zoom", percent?: number, target?: selector, direction?: "in" | "out" }
  ```

  `direction: "out"` (or `percent ≤ 100`) disengages. `target` optional:
  zooms toward an element rather than current pointer.

- `src/schemas/config.ts`:

  ```ts
  video.zoom: {
    mode: "off" | "manual" | "auto",   // default "off"
    percent: number,                    // 100–400, default 150
    deadZone: number,                   // fraction of viewport, default 0.3
    leadMs: number,                     // anticipation before an action, default 250
    settleMs: number,                   // hold after the action, default 600
    easing: <existing motion curve names>,
  }
  ```

- Precedence: `video.zoom` defaults ← scene-level override ← step parameters.

### Runner wiring

- `runDemo` installs the camera next to the cursor overlay; the same
  re-ensure hooks apply.
- Dispatch `action: "zoom"` in the step runners (both runners, matching the
  existing split).

## Milestone 2 — `mode: "auto"` policy

Central helper wraps interaction steps:

- **Engage** before `click` / `hover` / `type` / `drag`: resolve target rect,
  ease in with `leadMs` anticipation, anchor-centered.
- **Hold** through the action; pointer movement feeds `follow()` (the motion
  loop already computes every point — one call per frame).
- **Chain-aware disengage:** if the next auto-triggerable step targets a nearby
  region, cut directly between anchors instead of returning to 100%; otherwise
  ease out after `settleMs`.
- `scroll` steps and `confirm` dialogs never trigger the camera; a `scroll`
  while engaged eases out first.
- Manual `zoom` steps always win over auto behavior at their position in the
  demo.

## Tests (mirroring existing layout)

| Level                                                                     | Covers                                                                                                                                                 |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit (pure)                                                               | `decidePan` dead-zone/pan-speed/easing decisions; schema bounds (percent 100–400, mode enum); layered precedence merge                                 |
| `.browser.test.ts` (real Chromium, like `cursor-overlay.browser.test.ts`) | spike assertions promoted: clicks/typing/drags land correctly at 200%; cursor overlay alignment under zoom; scroll restore on disengage; iframe case   |
| Runner tests (fake page)                                                  | `zoom` step dispatch in both runners; auto mode engages around interactions and skips `scroll`; chain-cut vs ease-out selection; manual-overrides-auto |
| Timing                                                                    | scene timestamps still monotonic with camera animation time; dry-run keeps lead/settle delays                                                          |

## Docs & changelog

- README: feature blurb + minimal config example
- `docs/modules/runner.md`: camera engine, lifecycle, auto-policy rules
- `docs/modules/schemas.md`: `video.zoom` + `zoom` step reference
- CHANGELOG entry under `[Unreleased]` in the house narrative style

## Explicit non-goals

- Post-production zoompan architecture (source recordings stay un-zoomed)
- Keyframe/camera-path DSL beyond the single `zoom` step
- Zoom during `confirm` dialogs; WebP/APNG-style outputs

## Known risks

| Risk                                                            | Mitigation                                                                                |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| CDP coords disagree with CSS zoom                               | Milestone 0 gate; fallbacks ranked                                                        |
| Cursor overlay misaligns under zoom                             | Spike item 2; scale clamp math by zoom factor                                             |
| Apps reacting to resize mid-demo (ResizeObserver/media queries) | Honest browser-zoom semantics; `mode: "off"` and manual-only escape hatches               |
| Horizontal-scroll layouts                                       | Pan both axes; covered in browser tests                                                   |
| Frame wobble                                                    | Dead-zone + pan-speed cap are the whole point of the design; tune defaults on a real demo |

## Suggested defaults to tune on a real demo

`percent: 150`, `deadZone: 0.3`, `leadMs: 250`, `settleMs: 600`,
easing `easeInOutCubic`.
