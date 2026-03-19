# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
