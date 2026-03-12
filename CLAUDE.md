# Showbiz

AI-powered video storyboard desktop application using Google's Imagen 4 and Veo 3 APIs.

## Rules

### 1. Research, don't guess
**Always research before acting** — this applies to everything: bug fixes, new features, architecture decisions, planning, and ideation. Read source code, check docs, search the web, review GitHub issues. Understand the problem space before proposing or implementing a solution. Never trial-and-error your way through.

### 2. TDD for all TypeScript and Rust changes
Write a **failing test first**, then implement the fix/feature to make it pass. This applies to:
- All new functions in `src/lib/` (Vitest)
- All new Rust commands and utilities (`#[cfg(test)]` modules)
- Bug fixes: reproduce the bug in a test before fixing

### 3. Clean code practices
- Meaningful names, small focused functions, single responsibility
- No dead code, no commented-out code, no TODO comments without a tracking issue
- DRY — extract shared logic, but don't abstract prematurely
- Consistent patterns: if the codebase does something one way, follow that convention
- Handle errors explicitly — no silent swallows, no bare `unwrap()` in production paths

### 4. Memory-safe Rust
- Prefer safe Rust APIs over `unsafe` blocks whenever possible
- Use owned types (`String`, `Vec<u8>`) over raw pointers
- Prefer `.get()` over indexing, `Option`/`Result` over panics
- If `unsafe` is genuinely needed, document why and keep the block minimal
- Use `clippy` guidance: `cargo clippy` should pass clean

### 5. Always use yarn (never npm)

### 6. Always check the build
Run `yarn build:frontend` and `cargo check` before considering work done.

## What It Does

Showbiz lets users create video storyboards by:
1. Creating projects to organize work
2. Creating storyboards within projects
3. Adding shots to storyboards
4. Generating images for each shot using Imagen 4 (or uploading images)
5. Generating 8-second videos from those images using Veo 3
6. Assembling all shot videos into a final movie using FFmpeg.wasm

## Tech Stack

- **Desktop Framework**: Tauri v2
- **Frontend**: React 19 + Vite
- **Routing**: React Router v7 (3 routes)
- **Backend**: Rust (database, file I/O)
- **Database**: SQLite via rusqlite
- **Image Generation**: Google Imagen 4 (`imagen-4.0-generate-001`)
- **Video Generation**: Google Veo 3 (`veo-3.0-generate-001`), Veo 3.1 Fast, LTX Video
- **Video Assembly**: FFmpeg.wasm (browser-based, single-threaded build)
- **Video Playback**: mpv (external process on Linux/Windows, libmpv on macOS)
- **Styling**: Tailwind CSS v4

## Architecture

**Hybrid backend**: Rust handles DB + file I/O. TypeScript handles API calls to model providers (Imagen, Veo, LTX). API keys are fetched securely from Rust, passed to TS for the API call, then discarded.

**Video playback**: mpv, NOT HTML5 `<video>` (broken in WebKit/Tauri WebView). Embedded via X11 child windows (Linux), in-process libmpv (macOS), native views (Windows).

**Video export**: FFmpeg.wasm assembles videos in-memory, then bytes are saved to disk via Rust command + native save dialog (`tauri-plugin-dialog`). No blob URL downloads (broken in Tauri WebView).

**Media files**: Served via Tauri's `asset://` protocol using `convertFileSrc()`.

### FFmpeg.wasm

- Uses **single-threaded** `@ffmpeg/core` (NOT `@ffmpeg/core-mt`) — does NOT require SharedArrayBuffer
- Core loaded from CDN (`unpkg.com`) using **ESM** build (not UMD — UMD fails in WebKitGTK module workers)
- CSP must include `https://unpkg.com` in `script-src` for dynamic import inside worker
- CSP must include `wasm-unsafe-eval` in `script-src` for WASM compilation
- `Cross-Origin-Embedder-Policy: unsafe-none` required in Tauri headers (WebKitGTK injects COEP by default which blocks workers)
- `@ffmpeg/ffmpeg` and `@ffmpeg/util` excluded from Vite dep optimization (`optimizeDeps.exclude`) to preserve worker imports

## Project Structure

```
src/                              # React app (Vite)
  main.tsx                        # Entry point
  App.tsx                         # React Router setup (3 routes)
  globals.css                     # Tailwind CSS theme
  pages/
    WorkspacePage.tsx              # Projects list
    ProjectPage.tsx                # Storyboards list
    StoryboardPage.tsx             # Storyboard editor (shots)
  components/
    Header.tsx, ProjectCard.tsx, StoryboardCard.tsx
    ShotCard.tsx, ImageVersionTimeline.tsx
    SettingsDialog.tsx, TabNavigation.tsx
    theme-provider.tsx, mode-toggle.tsx
    timeline/                     # Timeline editor components
  lib/
    tauri-api.ts                  # Bridge layer (invoke wrappers, replaces server actions)
    models/                       # Model providers (Imagen, Veo, LTX, Gemini text)
    video-assembler.ts            # FFmpeg.wasm concatenation
    timeline-utils.ts             # Timeline clip utilities
    thumbnail-generator.ts        # Video thumbnail generation
  actions/
    generation-actions.ts         # Hybrid: gets API key from Rust, calls API in TS
  hooks/
    useTrimDrag.ts, useVideoPool.ts, useTimelinePlayback.ts

src-tauri/                        # Rust backend
  src/
    main.rs                       # Command registration + plugin init
    db.rs                         # SQLite schema + migrations
    media.rs                      # File I/O (save/read/delete)
    commands/
      projects.rs                 # Project + storyboard CRUD
      shots.rs                    # Shot CRUD + media save
      settings.rs                 # API key management
      image_versions.rs           # Version tree
      video_versions.rs           # Video version tree
      timeline.rs                 # Timeline edits
      media_cmd.rs                # Media path utility + assembled video export
      mpv/                        # mpv video player control
      http_client.rs              # HTTP proxy for cross-origin API calls
  capabilities/main.json          # Tauri v2 permissions (dialog, etc.)
  Cargo.toml
  tauri.conf.json

components/ui/                    # shadcn components (unchanged)
lib/utils.ts                      # cn() utility (unchanged)
index.html                        # Vite entry
vite.config.ts
package.json
tsconfig.json
```

## Tests

### TypeScript (Vitest)

```bash
yarn test          # Run all 170+ tests (watch mode)
yarn test --run    # Run once, exit
```

Tests are co-located with source in `src/lib/`:
- `src/lib/timeline-utils.test.ts` — timeline clip building, duration, time mapping
- `src/lib/tauri-api.test.ts` — asset URL conversion
- `src/lib/seek-utils.test.ts` — seek utilities
- `src/lib/models/*.test.ts` — model registry, capabilities, polling, config schemas, provider-specific logic (fal, replicate, veo)

### Rust (cargo test)

```bash
cd src-tauri && cargo test    # Run all 61+ tests
```

Tests use inline `#[cfg(test)] mod tests` in each module:
- `media.rs` — data URL parsing, MIME type mapping, extension mapping
- `db.rs` — ID generation
- `commands/projects.rs` — CRUD, cascade deletes
- `commands/settings.rs` — API key storage
- `commands/timeline.rs` — timeline edit upsert
- `commands/image_versions.rs` — version tree
- `commands/video_versions.rs` — video version tree, constraints
- `commands/mpv/mod.rs` — mpv controller

Rust tests use `tempfile` crate for isolated DB instances.

## Database Schema

Six tables with cascade deletes (SQLite via rusqlite):
- **projects**: id, name, created_at, updated_at
- **storyboards**: id, project_id (FK), name, image_model, video_model, created_at, updated_at
- **shots**: id, storyboard_id (FK), order, duration, image_prompt, image_path, video_prompt, video_path, status, created_at, updated_at
- **timeline_edits**: id, storyboard_id (FK), shot_id (FK), trim_in, trim_out, UNIQUE(storyboard_id, shot_id)
- **settings**: key (PK), value, updated_at
- **image_versions**: id, shot_id (FK), parent_version_id (self-ref FK), version_number, edit_type, image_path, prompt, edit_prompt, mask_path, is_current

Database stored at `{appDataDir}/data/showbiz.db`.

## Media Storage

- Images: `{appDataDir}/media/images/{shot-id}.{ext}`
- Videos: `{appDataDir}/media/videos/{shot-id}.{ext}`
- Version images: `{appDataDir}/media/images/versions/{shot-id}/vN.{ext}`
- Masks: `{appDataDir}/media/masks/{shot-id}/{version-id}.png`
- Database stores relative paths, frontend uses `convertFileSrc()` for asset:// URLs
- Cache-busting timestamps added to URLs for regeneration

## Key Implementation Details

### Video Generation Flow
1. TS gets API key from Rust (invoke `get_api_key`)
2. TS calls model API (fetch)
3. TS sends video bytes to Rust (invoke `save_and_complete_video`)
4. Rust saves file + updates DB
5. Returns absolute path, frontend converts to asset:// URL

### Video Export Flow
1. FFmpeg.wasm assembles videos in-memory → returns `Uint8Array`
2. Native save dialog (`@tauri-apps/plugin-dialog`) lets user choose path
3. Bytes written to disk via Rust `save_assembled_video` command

### API Keys
- Stored in DB settings table
- Falls back to environment variables (GEMINI_API_KEY, LTX_API_KEY)
- Managed via Settings dialog

## Git Workflow

```
main  ← stable releases only (tagged here, CI builds release artifacts)
  └── dev  ← integration branch (PRs target here)
        └── feature/...  ← feature branches (branch off dev, PR back to dev)
```

- **Feature branches**: branch off `dev`, PR back to `dev`
- **`dev`**: daily integration. PRs trigger tests + build verification (no artifacts persisted)
- **`main`**: stable only. Merged from `dev` when ready to release
- **Tags**: only on `main`. Push a `v*` tag → CI builds all platforms and creates a draft GitHub Release with artifacts
- **Never force-push tags.** If a fix is needed after tagging, bump to the next patch version
- **Release titles**: just the version number (e.g. `v0.6.1`), no subtitles
- **Always create a new commit** instead of amending

## Commands

```bash
yarn dev          # Launch Tauri dev mode (frontend + Rust backend)
yarn build        # Production build (produces .deb/.AppImage on Linux)
yarn dev:frontend # Frontend-only dev server (Vite)
yarn build:frontend # Frontend-only build
yarn test         # Run Vitest (watch mode)
yarn test --run   # Run Vitest once
cd src-tauri && cargo test   # Run Rust tests
cd src-tauri && cargo check  # Type-check Rust without building
```
