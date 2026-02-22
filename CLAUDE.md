# Showbiz

AI-powered video storyboard desktop application using Google's Imagen 4 and Veo 3 APIs.

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
- **Video Assembly**: FFmpeg.wasm (browser-based)
- **Styling**: Tailwind CSS v4

## Architecture

**Hybrid backend**: Rust handles DB + file I/O. TypeScript handles API calls to model providers (Imagen, Veo, LTX). API keys are fetched securely from Rust, passed to TS for the API call, then discarded.

Media files are served via Tauri's `asset://` protocol using `convertFileSrc()`.

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
    main.rs                       # Command registration
    db.rs                         # SQLite schema + migrations
    media.rs                      # File I/O (save/read/delete)
    commands/
      projects.rs                 # Project + storyboard CRUD
      shots.rs                    # Shot CRUD + media save
      settings.rs                 # API key management
      image_versions.rs           # Version tree
      timeline.rs                 # Timeline edits
      media_cmd.rs                # Media path utility
  Cargo.toml
  tauri.conf.json

components/ui/                    # shadcn components (unchanged)
lib/utils.ts                      # cn() utility (unchanged)
index.html                        # Vite entry
vite.config.ts
package.json
tsconfig.json
```

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

### FFmpeg.wasm
- Requires COOP/COEP headers (configured in vite.config.ts)
- Runs entirely in browser WebView
- Used for video concatenation with trim support

### API Keys
- Stored in DB settings table
- Falls back to environment variables (GEMINI_API_KEY, LTX_API_KEY)
- Managed via Settings dialog

## Commands

```bash
yarn dev          # Launch Tauri dev mode (frontend + Rust backend)
yarn build        # Production build (produces .deb/.AppImage on Linux)
yarn dev:frontend # Frontend-only dev server (Vite)
yarn build:frontend # Frontend-only build
```
