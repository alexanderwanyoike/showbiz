# Showbiz

AI-powered video storyboard desktop application. Each shot is built from a start frame and an optional end frame plus a prompt; the video model animates between the frames. A project "bible" keeps characters, locations, props and styles consistent and composes scene frames from them. Shots are assembled into a final movie.

## Rules

### 1. Research, don't guess
**Always research before acting** - this applies to everything: bug fixes, new features, architecture decisions, planning, and ideation. Read source code, check docs, search the web, review GitHub issues. Understand the problem space before proposing or implementing a solution. Never trial-and-error your way through.

### 2. TDD for all TypeScript and Rust changes
Write a **failing test first**, then implement the fix/feature to make it pass. This applies to:
- All new functions in `src/lib/` (Vitest)
- All new Rust commands and utilities (`#[cfg(test)]` modules)
- Bug fixes: reproduce the bug in a test before fixing

### 3. Clean code practices
- Meaningful names, small focused functions, single responsibility
- No dead code, no commented-out code, no TODO comments without a tracking issue
- DRY - extract shared logic, but don't abstract prematurely
- Consistent patterns: if the codebase does something one way, follow that convention
- Handle errors explicitly - no silent swallows, no bare `unwrap()` in production paths

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
2. Building a project **bible** of reusable, consistent assets (characters, locations, props, styles) and composing **scene frames** from them
3. Creating storyboards within projects and adding shots
4. Giving each shot a **start frame** and an optional **end frame** plus a prompt. Frames come from the bible composer, image generation, or upload
5. Generating a video that animates between the start and end frames
6. Assembling all shot videos into a final movie using FFmpeg.wasm

## Tech Stack

- **Desktop Framework**: Tauri v2
- **Frontend**: React 19 + Vite
- **Routing**: React Router v7 (3 routes)
- **Backend**: Rust (database, file I/O)
- **Database**: SQLite via rusqlite, migrations via `rusqlite_migration`
- **Image generation / scene composition**: Gemini image models (Nano Banana = 2.5 Flash via `generateContent`; Nano Banana 2 = 3.1 Flash and Nano Banana Pro = 3 Pro via the Interactions API), OpenAI GPT Image 2, Flux (via fal). Multi-reference composition through a shared `composeImage` transport interface.
- **Video generation**: Google Veo 3 / Veo 3.1 Fast, Seedance 2 (start/end-frame, via fal). Provider registry driven by JSON configs.
- **Video Assembly**: FFmpeg.wasm (browser-based, single-threaded build)
- **Video Playback**: mpv (external process on Linux/Windows, libmpv on macOS)
- **Styling**: Tailwind CSS v4

## Architecture

**Hybrid backend**: Rust handles DB + file I/O. TypeScript handles API calls to model providers (image, video, text). API keys are fetched securely from Rust, passed to TS for the API call, then discarded. Cross-origin API calls are proxied through a Rust `http_request` command (the WebView cannot make them directly), which sends a single JSON string body, so providers must use JSON endpoints (not multipart).

**Video playback**: mpv, NOT HTML5 `<video>` (broken in WebKit/Tauri WebView). Embedded via X11 child windows (Linux), in-process libmpv (macOS), native views (Windows).

**Video export**: FFmpeg.wasm assembles videos in-memory, then bytes are saved to disk via Rust command + native save dialog (`tauri-plugin-dialog`). No blob URL downloads (broken in Tauri WebView).

**Media files**: Served via Tauri's `asset://` protocol using `convertFileSrc()`.

### FFmpeg.wasm

- Uses **single-threaded** `@ffmpeg/core` (NOT `@ffmpeg/core-mt`) - does NOT require SharedArrayBuffer
- Core loaded from CDN (`unpkg.com`) using **ESM** build (not UMD - UMD fails in WebKitGTK module workers)
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
    WorkspacePage.tsx              # Projects grid
    ProjectPage.tsx                # Storyboards list + project bible
    StoryboardPage.tsx             # Storyboard shell (storyboard + editor modes)
  components/
    ProjectBibleView.tsx          # Bible: assets, variants, scene-frame composer
    ShotList.tsx ShotPreview.tsx ShotInspector.tsx  # Storyboard-mode zones
    MediaPool.tsx                 # Editor-mode media grid
    StoryboardModeView.tsx        # Slot-based storyboard-mode view
    layout/                       # Zone layout system
    timeline/                     # Multi-track timeline editor
    ImageVersionTimeline.tsx VideoVersionTimeline.tsx
    SettingsDialog.tsx Header.tsx ProjectCard.tsx StoryboardCard.tsx
  lib/
    tauri-api.ts                  # Bridge layer (invoke wrappers)
    models/
      providers/{image,video}/*.json  # One JSON config per model
      transports/                 # Per-API adapters: google-image,
                                  #   google-interactions-image, openai-image,
                                  #   fal-*, kie-*, replicate-*
      registry.ts config-schema.ts types.ts
    generation/                   # video-modes (mode + validation), run-guard, types
    bible-assets.ts               # Bible variant helpers
    video-assembler.ts            # FFmpeg.wasm concatenation
    timeline-utils.ts             # Timeline clip utilities
    video-duration.ts             # Probed video duration cache
    thumbnail-generator.ts        # Video thumbnail generation
  actions/
    generation-actions.ts         # Image/video gen + composeFrameAction
  hooks/
    useMpvPlayer.ts useTimelinePlayback.ts useTrimDrag.ts useVideoDurations.ts

src-tauri/                        # Rust backend
  src/
    main.rs                       # Command registration + plugin init
    db.rs                         # Migration runner (rusqlite_migration)
    migrations/                   # Numbered .sql migration files (append-only)
    media.rs                      # File I/O (save/read/delete)
    commands/
      projects.rs                 # Project + storyboard CRUD
      shots.rs                    # Shot CRUD, start/end frame media
      bibles.rs                   # Bible, assets, variants CRUD
      settings.rs                 # API key storage
      image_versions.rs           # Image version tree
      video_versions.rs           # Video version tree
      timeline.rs                 # Timeline edits, tracks, clips
      media_cmd.rs                # Media path utility + assembled video export
      mpv/                        # mpv video player control
      http_client.rs              # JSON HTTP proxy for cross-origin API calls
  capabilities/main.json          # Tauri v2 permissions
  Cargo.toml
  tauri.conf.json

components/ui/                    # shadcn components
lib/utils.ts                      # cn() utility
index.html vite.config.ts package.json tsconfig.json
```

## Tests

### TypeScript (Vitest)

```bash
yarn test          # Run all 293 tests (watch mode)
yarn test --run    # Run once, exit
```

Tests are co-located with source under `src/lib/`:
- `timeline-utils`, `seek-utils`, `video-preview`, `video-duration` - timeline + playback utilities
- `tauri-api` - asset URL conversion
- `bible-assets` - variant selection, export, shot video source
- `generation/video-modes` - generation mode selection + request validation
- `generation/run-guard` - generation run guarding
- `models/*` - registry, capabilities, config schema, polling
- `models/transports/*` - per-API request/response shapes (google-image, google-interactions-image, openai-image, fal-image, fal-video)

### Rust (cargo test)

```bash
cd src-tauri && cargo test    # Run all 93 tests
```

Tests use inline `#[cfg(test)] mod tests` in each module:
- `db.rs` - migration validity, schema (start/end frame, scene asset type, cascades), ID generation
- `media.rs` - data URL parsing, MIME type and extension mapping
- `commands/{projects,settings,timeline,image_versions,video_versions,bibles}.rs` - CRUD, cascades, constraints
- `commands/mpv/mod.rs` - mpv controller

## Database Schema

Eleven tables with cascade deletes (SQLite via rusqlite). The schema lives in `src-tauri/src/migrations/` and is applied by `rusqlite_migration`, tracked via SQLite's `user_version`. To change the schema, add a new numbered `.sql` file; never edit a shipped migration.

- **projects**: id, name, timestamps
- **storyboards**: id, project_id (FK), name, image_model, video_model, timestamps
- **shots**: id, storyboard_id (FK), order, duration, image_prompt, image_path (start frame), **end_frame_path**, video_prompt, video_path, status, timestamps
- **timeline_tracks / timeline_clips**: multi-track timeline state; each clip owns its trim window (trim_in/trim_out, source-file seconds) and may pin a video_version_id (NULL = follow the shot's current version)
- **settings**: key (PK), value, updated_at
- **image_versions / video_versions**: per-shot version trees (self-ref FK, edit_type, is_current)
- **bibles**: id, project_id (FK), name, is_default (auto-created per project via trigger)
- **bible_assets**: id, bible_id (FK), asset_type (`character`/`location`/`prop`/`style`/`reference`/`note`/`scene`), name, status
- **bible_asset_variants**: id, asset_id (FK), media_path, prompt, source_kind, status, is_primary (the images, including composed scene frames)

Database stored at `{appDataDir}/data/showbiz.db`.

## Media Storage

- Start frame: `{appDataDir}/media/images/{shot-id}.{ext}`
- End frame: `{appDataDir}/media/images/{shot-id}_end.{ext}`
- Videos: `{appDataDir}/media/videos/{shot-id}.{ext}`
- Version images: `{appDataDir}/media/images/versions/{shot-id}/vN.{ext}`
- Bible variant images: `{appDataDir}/media/bible/{bible-id}/{variant-id}.{ext}`
- Masks: `{appDataDir}/media/masks/{shot-id}/{version-id}.png`
- Database stores relative paths, frontend uses `convertFileSrc()` for asset:// URLs
- Cache-busting timestamps added to URLs for regeneration

## Key Implementation Details

### Frame Composition
1. `composeImage(prompt, referenceImages[])` on the image transport interface takes a prompt plus one or more base64 reference images and returns a single image
2. The bible scene composer routes selected assets (their primary variant images) into `composeFrameAction`, which calls `composeImage` on the chosen engine
3. Implemented per engine: `google-image` (Gemini 2.5, `generateContent` multi-part), `google-interactions-image` (Gemini 3, Interactions API), `openai-image` (GPT Image 2, Responses API)
4. Composed frames are stored as bible `scene` variants, then assigned to a shot's start or end frame from the inspector

### Video Generation Flow
1. Mode is chosen from the shot's frames: a start frame (with optional end frame) gives image-to-video, otherwise text-to-video
2. TS gets the API key from Rust (`get_api_key`), reads the frame(s) as base64, calls the model API
3. TS sends the video bytes to Rust (`save_and_complete_video` / video-version commands)
4. Rust saves the file + updates the DB, returns the path, frontend converts to an `asset://` URL

### Video Export Flow
1. FFmpeg.wasm assembles videos in-memory → returns `Uint8Array`
2. Native save dialog (`@tauri-apps/plugin-dialog`) lets user choose path
3. Bytes written to disk via Rust `save_assembled_video` command

### API Keys
- Stored in the DB `settings` table, managed via the Settings dialog
- Providers: `gemini`, `openai`, `ltx`, `kie`, `fal`, `replicate`
- Fetched on demand from Rust for a single API call; not persisted in TS

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
