# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
- Support for multiple scenario files (*.demo.ts)
- Video recording via Playwright
- Human-like cursor movement with Bezier curves
- Natural typing with variable delays
- Custom cursor overlay (SVG or dot style)
- Configurable viewport and video size
- Config discovery: demo-reel.config.ts, *.demo.ts, --all flag
- CI/CD ready with proper exit codes
- Dry-run mode for config validation
- Published to npm

### Features
- 12 step types: goto, click, hover, type, press, scroll, select, check, upload, drag, wait, waitFor
- 4 selector strategies: testId, id, class, href
- Configurable motion, typing, and timing settings
- Progress reporting and verbose output
