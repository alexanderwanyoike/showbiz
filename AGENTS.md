# Showbiz — Agent Instructions

AI-powered video storyboard desktop application (Tauri v2 + React 19 + Rust).

## Rules

### 1. Research, don't guess
**Always research before acting** — this applies to everything: bug fixes, new features, architecture decisions, planning, and ideation. Read source code, check docs, search the web, review GitHub issues. Understand the problem space before proposing or implementing a solution. Never trial-and-error your way through.

### 2. TDD for all TypeScript and Rust changes
Write a **failing test first**, then implement the fix/feature to make it pass.
- TypeScript: Vitest, tests co-located in `src/lib/*.test.ts`
- Rust: inline `#[cfg(test)] mod tests` in each module, uses `tempfile` crate

### 3. Clean code practices
- Meaningful names, small focused functions, single responsibility
- No dead code, no commented-out code, no TODO comments without a tracking issue
- DRY — extract shared logic, but don't abstract prematurely
- Consistent patterns: follow existing codebase conventions
- Handle errors explicitly — no silent swallows, no bare `unwrap()` in production paths

### 4. Memory-safe Rust
- Prefer safe Rust APIs over `unsafe` blocks whenever possible
- Use owned types (`String`, `Vec<u8>`) over raw pointers
- Prefer `.get()` over indexing, `Option`/`Result` over panics
- If `unsafe` is genuinely needed, document why and keep the block minimal
- `cargo clippy` should pass clean

### 5. Always use yarn (never npm)

### 6. Always check the build
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
