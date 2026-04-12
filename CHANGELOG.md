# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Narration Manifest Pipeline**: Per-scene narration manifests and clip artifacts for exact scene-based audio placement during rendering
- **Provider-Aware Voice Config**: Centralized voice config parsing with curated provider defaults and `voicePath` support for custom Piper models
- **Confirm Dialog Step**: New `confirm` step to explicitly accept or dismiss browser dialogs as part of a demo flow
- **Ordered CI Workflow**: GitHub Actions workflow that runs format, lint, test, and build in sequence with clear step-level failure reporting
- **Coverage Badge Automation**: README coverage badge generated from Vitest coverage totals and refreshed automatically on `main`
- **AI Script Generation**: New `demo-reel script` command for AI-powered demo video creation
  - `script generate` — Generate a demo script from a natural language description using Claude API
  - `script voice` — Generate voiceover narration audio via OpenAI TTS with caching
  - `script build` — Assemble a timed `.demo.ts` from a script with audio-synced timing
  - `script validate` — Validate selectors against the live app
  - `script fix` — Re-crawl and fix broken selectors via LLM
  - Full pipeline shortcut: `demo-reel script "description" --url <url>`
- **DOM Crawler**: Playwright-based interactive element extraction with selector ranking (data-testid > id > href > class > custom)
- **Timing Engine**: Audio-first synchronization that adjusts step delays to match narration duration
- **Voice Caching**: Generated audio cached by content hash in `.demo-reel-cache/voice/`
- **`/demo-script` Claude Code Skill**: Interactive, collaborative script building inside Claude Code — crawl pages, draft scenes together, iterate on narration, generate `.demo.ts` files
- **Site Explorer**: `explore.ts` logs in and clicks through SPA pages to discover selectors and page structure
- **Modular Video Series Pattern**: Design pattern for standalone videos that work independently and as a guided series — each video has its own preSteps for reproducible state setup
- **Piper TTS Provider**: Local, free text-to-speech via Piper with Dutch voice support (`nl_NL-mls-medium`). No API key required for development iteration.
- **TTS Provider Interface**: Pluggable provider system — `piper` (local/free, default) and `openai` built-in, with `registerTTSProvider()` for custom providers
- **Scene Timeline Tracking**: `runDemo()` now records wall-clock timestamps for each scene boundary during recording
- **Subtitle Generation**: Automatically generates `.srt` and `.vtt` subtitle files alongside the video, with per-scene narration text and actual timestamps
- **Scene Metadata**: Generates `.meta.json` with scene timestamps, intro end point, and chapter markers for interactive presentation systems
- **`scenes` Config Field**: New optional config field to declare scene boundaries with narration text, step indices, and intro markers

### Fixed

- **Subtitle timing accuracy**: Narrated scenes now use exact per-scene narration placement instead of inferred offsets when manifests are available
- **Narration artifact invalidation**: Voice assets are regenerated when narration processing logic changes, avoiding stale output reuse
- **Docker runtime file ownership**: Containerized runs now preserve host user ownership more reliably by passing through UID/GID when available
- **Video recording without auth**: Scenarios without `auth` config now correctly record video (was calling `startBrowser` instead of `startRecording`)
- **preSteps execution**: `preSteps` are now actually executed before recording begins (were silently ignored)
- **Temp file cleanup**: Temporary video files in `.demo-reel-temp/` are now deleted after processing
- **Smooth scroll animation**: `scroll` steps now animate smoothly with eased incremental scrolling instead of jumping instantly
- **Native cursor hidden**: Browser's native cursor is now hidden via CSS when the cursor overlay is active, preventing double cursors

### Added

- **Built-in Presets**: Simplified configuration with preset shortcuts for cursor, motion, typing, and timing
  - Cursor presets: `'dot'`, `'arrow'`, `'none'`
  - Motion presets: `'smooth'`, `'snappy'`, `'instant'`
  - Typing presets: `'humanlike'`, `'fast'`, `'instant'`
  - Timing presets: `'normal'`, `'fast'`, `'instant'`
  - Use string shortcuts (e.g., `cursor: 'dot'`) or full objects (e.g., `cursor: { type: 'dot', size: 16 }`)
- **`init` Command**: New `demo-reel init` command creates `example.demo.ts` template
- **Documentation**: Added descriptive `.describe()` calls on all Zod schema fields for IDE tooltips
- **Selector Indexing**: Select a specific match with `selector.index` (0-based)
- **New Selector Strategy**: `data-node-id` for `[data-node-id="..."]`
- **Custom Selector Strategy**: `custom` uses a raw selector string
- **Type Clear Option**: `type` steps support `clear: true` to clear inputs before typing
- **Output Format**: `outputFormat` lets you choose `webm` or `mp4` (audio requires `mp4`)
- **Randomization Seed**: `randomization.seed` enables deterministic cursor/typing variation
- **Scenario Tags**: `tags` plus `--tag` CLI filtering

### Changed

- **Voice configuration model**: Voice settings are now resolved through a shared provider-specific schema used by the main CLI and script tooling
- **Narration/subtitle synchronization**: Video processing now aligns narration clips to recorded scene timestamps and surfaces overlap/missing-scene warnings
- **Docker image layout**: Container build now uses stricter multi-stage packaging, verified Piper downloads, isolated Playwright browser installation, and non-root runtime defaults
- **Docs and examples**: Voice examples now use provider-specific values and document custom Piper `voicePath` usage
- **Demo assets**: Removed the old Epistola demo/config example from the repository
- **`demo-reel` (no args)**: Now runs all `*.demo.ts` files instead of requiring `--all` flag
- **Simplified CLI**: Removed default config file concept; scenarios are always `*.demo.ts` files
- **Type Exports**: Added `DemoReelConfigInput` type for autocomplete with preset strings
- **Video Resolution Config**: Removed `viewport` and `video.enabled`; use `video.resolution`

### Technical

- Added `narration-manifest.ts` and `voice-config.ts` modules to centralize narration artifact metadata and voice resolution
- Added `coverage:badge`, `format:ci`, and `lint:ci` scripts for CI and badge generation workflows
- New `presets.ts` module with preset definitions
- Restructured schema to separate input types (for autocomplete) from output types (after transform)
- `defineConfig()` accepts preset strings and transforms them at parse time
- `demoReelConfigInputSchema` exported for IDE type inference

## [0.1.3] - 2026-03-21

### Added

- **TypeScript Go Port (tsgo)**: Now using Microsoft's native TypeScript compiler
  - 3x faster builds (0.64s vs 1.86s)
  - Native Go implementation of TypeScript compiler
  - Experimental but working well for this codebase
  - Fallback to tsc available with `pnpm build:tsc`
- **Session Persistence**: Complete authentication system with session capture and restoration
  - New `auth` configuration with `loginSteps`, `validate`, `storage`, and `behavior` options
  - Automatic session validation before running demos
  - Support for cookies and localStorage capture
  - Multiple named sessions support for different apps/users
  - Smart re-authentication when sessions expire
  - Force re-auth option to bypass saved sessions
  - Clear invalid sessions automatically
  - Comprehensive test suite (37 tests)

### Changed

- **Breaking**: Old auth config format deprecated (`persistCookies`, `cookieFile`, `loginUrl`, `successUrl`)
- Sessions now stored in structured JSON format in `.demo-reel-sessions/` directory
- Better session isolation with named sessions per demo configuration
- Added vitest testing framework

### Fixed

- Session validation properly waits for success indicator element with `waitFor()` and 5 second timeout
- Fixed strict mode violation error when multiple elements match success indicator selector (uses `.first()`)
- Changed page load from `domcontentloaded` to `networkidle` for better reliability
- Added verbose logging to help debug validation issues

## [0.1.2-beta.2] - 2026-03-21

### Fixed

- Fixed strict mode violation error when multiple elements match success indicator selector
  - Use `.first()` to handle multiple matching elements
  - Added verbose logging to help debug validation issues

## [0.1.2-beta.1] - 2026-03-21

### Fixed

- Session validation now properly waits for success indicator element
  - Changed from `isVisible()` (instant check) to `waitFor()` with 5 second timeout
  - Changed page load from `domcontentloaded` to `networkidle` for better reliability

## [0.1.2-beta.0] - 2026-03-21

### Added

- **Session Persistence**: Intelligent authentication with session capture and restoration
  - New `auth` configuration with `loginSteps`, `validate`, `storage`, and `behavior` options
  - Automatic session validation before running demos
  - Support for cookies and localStorage capture
  - Multiple named sessions support for different apps/users
  - Smart re-authentication when sessions expire
  - Force re-auth option to bypass saved sessions
  - Clear invalid sessions automatically

### Changed

- **Breaking**: Old auth config format deprecated (`persistCookies`, `cookieFile`, `loginUrl`, `successUrl`)
- Sessions now stored in structured JSON format in `.demo-reel-sessions/` directory
- Better session isolation with named sessions per demo configuration

### Technical

- New `auth.ts` module for session management
- Updated video handler with integrated auth flow
- New types exported: `StorageType`, `AuthStorageConfig`, `AuthValidateConfig`, `AuthBehaviorConfig`

## [0.1.1-beta.1] - 2024-03-19

### Fixed

- Audio mixing now outputs MP4 format instead of WebM (WebM doesn't support AAC audio codec)

## [0.1.1-beta.0] - 2024-03-19

### Added

- **Audio Support**: Add narration and background music to demo videos
  - Support for MP3 audio files
  - Mix narration with background music
  - Configurable background music volume (0.0 - 1.0)
  - FFmpeg integration via ffmpeg-static
- New `audio` config option with `narration`, `background`, and `backgroundVolume` fields
- Audio paths resolved relative to config file location
- Video continues playing even if audio ends first

### Technical

- Added `ffmpeg-static` as a required dependency
- New `audio-processor.ts` module for FFmpeg operations
- Updated video handler to support audio mixing
- Updated config schema to validate audio options

## [0.1.0] - 2024-03-19

### Added

- Initial release of demo-reel
- CLI tool for creating demo videos from web apps
- `defineConfig()` API for TypeScript-first configuration
- Support for multiple scenario files (\*.demo.ts)
- Video recording via Playwright
- Human-like cursor movement with Bezier curves
- Natural typing with variable delays
- Custom cursor overlay (SVG or dot style)
- Configurable viewport and video size
- Config discovery: demo-reel.config.ts, \*.demo.ts, --all flag
- CI/CD ready with proper exit codes
- Dry-run mode for config validation
- Published to npm

### Features

- 12 step types: goto, click, hover, type, press, scroll, select, check, upload, drag, wait, waitFor
- 4 selector strategies: testId, id, class, href
- Configurable motion, typing, and timing settings
- Progress reporting and verbose output
