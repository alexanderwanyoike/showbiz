# Showbiz — Agent Instructions

AI-powered video storyboard desktop application (Tauri v2 + React 19 + Rust).

## Rules

### 1. Research, don't guess
When hitting platform-specific bugs (WebKit, Tauri, WASM, CSP, etc.), **always research** the actual root cause before attempting a fix. Read source code, check GitHub issues, search the web. One researched fix beats five guesses.

### 2. TDD for all TypeScript and Rust changes
Write a **failing test first**, then implement the fix/feature to make it pass.
- TypeScript: Vitest, tests co-located in `src/lib/*.test.ts`
- Rust: inline `#[cfg(test)] mod tests` in each module, uses `tempfile` crate

### 3. Always use yarn (never npm)

### 4. Always check the build
Run `yarn build:frontend` and `cargo check` before considering work done.

## Architecture

- **Frontend**: React 19 + Vite (`src/`)
- **Backend**: Rust via Tauri v2 (`src-tauri/`)
- **Bridge**: `src/lib/tauri-api.ts` wraps all `invoke()` calls
- **Video playback**: mpv (NOT HTML5 `<video>` — broken in WebKit)
- **Video export**: FFmpeg.wasm (single-threaded `@ffmpeg/core`, ESM build from CDN) → native save dialog → Rust writes to disk
- **CSP**: `script-src` must include `https://unpkg.com` and `wasm-unsafe-eval` for FFmpeg.wasm worker
- **COEP**: Must be `unsafe-none` in Tauri headers (WebKitGTK default blocks workers)

## Commands

```bash
yarn dev              # Launch Tauri dev mode
yarn build:frontend   # Frontend production build
yarn test --run       # Run all Vitest tests (170+)
cd src-tauri && cargo test    # Run all Rust tests (61+)
cd src-tauri && cargo check   # Type-check Rust
```

## Key Constraints

- HTMLVideoElement is broken in WebKit/Tauri WebView — do NOT use `<video>` tags for playback
- Blob URL downloads don't work in Tauri WebView — use Rust commands + native dialogs for file export
- FFmpeg.wasm must use ESM build (not UMD) — UMD fails in WebKitGTK module workers
- `@ffmpeg/ffmpeg` and `@ffmpeg/util` must be in `optimizeDeps.exclude` in vite.config.ts

## Test Structure

**TypeScript** (`yarn test --run`):
- `src/lib/timeline-utils.test.ts` — timeline clips, duration, time mapping
- `src/lib/tauri-api.test.ts` — asset URL conversion
- `src/lib/seek-utils.test.ts` — seek utilities
- `src/lib/models/*.test.ts` — model registry, capabilities, polling, config, providers

**Rust** (`cargo test` in `src-tauri/`):
- `media.rs` — data URL parsing, MIME types
- `db.rs` — ID generation
- `commands/projects.rs` — CRUD, cascade deletes
- `commands/settings.rs` — API key storage
- `commands/timeline.rs` — timeline edits
- `commands/image_versions.rs` — version tree
- `commands/video_versions.rs` — video versions
- `commands/mpv/mod.rs` — mpv controller
