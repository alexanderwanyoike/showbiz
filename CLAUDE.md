# Showbiz

AI-powered video storyboard desktop application. Each shot is built from a start frame and an optional end frame plus a prompt; the video model animates between the frames. A project "bible" keeps characters, locations, props and styles consistent and composes scene frames from them. Shots are assembled into a final movie.

## Rules

### 1. Research, don't guess
**Always research before acting** - this applies to everything: bug fixes, new features, architecture decisions, planning, and ideation. Read source code, check docs, search the web, review GitHub issues. Understand the problem space before proposing or implementing a solution. Never trial-and-error your way through.

### 2. TDD for all TypeScript changes
Write a **failing test first**, then implement the fix/feature to make it pass. This applies to:
- All new functions in `src/lib/` (Vitest)
- All new Electron main-process commands and utilities (`electron/`, Vitest)
- Bug fixes: reproduce the bug in a test before fixing

### 3. Clean code practices
- Meaningful names, small focused functions, single responsibility
- No dead code, no commented-out code, no TODO comments without a tracking issue
- DRY - extract shared logic, but don't abstract prematurely
- Consistent patterns: if the codebase does something one way, follow that convention
- Handle errors explicitly - no silent swallows

### 4. Always use yarn (never npm)

### 5. Always check the build
Run `yarn build:frontend` and `yarn build:electron` before considering work done. For packaging changes, run `yarn build` (full electron-builder pass).

## What It Does

Showbiz lets users create video storyboards by:
1. Creating projects to organize work
2. Building a project **bible** of reusable, consistent assets (characters, locations, props, styles) and composing **scene frames** from them
3. Creating storyboards within projects and adding shots
4. Giving each shot a **start frame** and an optional **end frame** plus a prompt. Frames come from the bible composer, image generation, or upload
5. Generating a video that animates between the start and end frames
6. Assembling all shot videos into a final movie with native ffmpeg

## Tech Stack

- **Desktop Framework**: Electron (Chromium renderer + Node main process)
- **Frontend**: React 19 + Vite
- **Routing**: React Router v7 with `HashRouter` (path routing cannot match `file://` asar paths in packaged builds)
- **Backend**: Electron main process (`electron/`) - database, file I/O, export
- **Database**: SQLite via `node:sqlite`, numbered `.sql` migrations in `electron/migrations/` tracked via `user_version`
- **Image generation / scene composition**: Gemini image models (Nano Banana = 2.5 Flash via `generateContent`; Nano Banana 2 = 3.1 Flash and Nano Banana Pro = 3 Pro via the Interactions API), OpenAI GPT Image 2 (fal-hosted), Flux (via fal). Multi-reference composition through a shared `composeImage` transport interface.
- **Video generation**: Google Veo 3.1, Seedance 2, Kling 3, LTX-2.3, Wan 2.1 FLF (all via fal). Provider registry driven by JSON configs.
- **Video export**: native ffmpeg spawned by the main process (`ffmpeg-static` / `ffprobe-static`, unpacked to `resources/bin/` in packaged builds)
- **Video Playback**: HTML5 `<video>` (Chromium)
- **Styling**: Tailwind CSS v4

## Architecture

**Split by process**: the Electron main process handles DB + file I/O + export. The renderer (TypeScript) handles UI and API calls to model providers (image, video, text). API keys are fetched from the main process per call, used, then discarded. Cross-origin API calls are proxied through the main-process `http_request` command, which sends a single JSON string body, so providers must use JSON endpoints (not multipart).

**IPC bridge**: the preload script exposes `window.showbiz` (`invoke`, `readMediaBytes`, `onExportProgress`). `src/lib/bridge.ts` wraps it and strips Electron's IPC error wrapping so UI code sees bare error messages. Command names and JSON shapes are snake_case (preserved from the original Rust backend).

**Media files**: served blob-over-IPC. `src/lib/electron-media-url.ts` reads bytes via `readMediaBytes` and caches `blob:` URLs per absolute path; saves that overwrite a file in place must pass `invalidate=true`. Do NOT use a custom streamed protocol - Electron's `protocol.handle` mishandles Chromium's abort/resume media fetches.

**Video export**: the renderer sends clip identity + trim + position (`export_timeline_video`); the main process resolves file paths from the DB (renderer URLs are `blob:`), builds an ffmpeg filter graph (trims via `-ss`/`-to` input options where `-to` is ABSOLUTE from file start, black+silence for gaps, probe-based setting defaults), and streams `-progress pipe:1` back over IPC. Known limitation (issue #77): overlapping tracks concatenate instead of preview-style splicing.

## Project Structure

```
src/                              # React app (Vite, renderer)
  main.tsx                        # Entry point (HashRouter)
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
    timeline/                     # Multi-track timeline editor (HTML5 pool playback)
    ImageVersionTimeline.tsx VideoVersionTimeline.tsx
    SettingsDialog.tsx Header.tsx ProjectCard.tsx StoryboardCard.tsx
  lib/
    bridge.ts                     # window.showbiz IPC wrapper + error normalization
    backend-api.ts                # Typed invoke wrappers for every command
    electron-media-url.ts         # blob-over-IPC media URL cache
    models/
      providers/{image,video}/*.json  # One JSON config per model
      transports/                 # Per-API adapters: google-image,
                                  #   google-interactions-image, openai-image,
                                  #   fal-*, kie-*, replicate-*
      registry.ts config-schema.ts types.ts
    generation/                   # video-modes (mode + validation), run-guard, types
    bible-assets.ts               # Bible variant helpers
    export-payload.ts             # Export clip payload builders (timeline + concat)
    timeline-utils.ts             # Timeline clip utilities
    video-duration.ts             # Probed video duration cache
    thumbnail-generator.ts        # Video thumbnail generation
  actions/
    generation-actions.ts         # Image/video gen + composeFrameAction
  hooks/
    useHtml5TimelinePlayback.ts useVideoPool.ts useTrimDrag.ts useVideoDurations.ts

electron/                         # Main process
  main.ts                         # Window, IPC registration, app menu
  preload.ts                      # window.showbiz bridge
  db.ts                           # node:sqlite open + migration runner
  migrations/                     # Numbered .sql migration files (append-only)
  media-files.ts                  # File I/O (save/read/delete)
  export.ts export-deps.ts        # ffmpeg export planning + binary resolution
  commands/                       # projects, shots, bibles, settings,
                                  #   image-versions, video-versions, timeline,
                                  #   media, export, http (JSON proxy)

build/icons/                      # App icons (electron-builder buildResources)
components/ui/                    # shadcn components
lib/utils.ts                      # cn() utility
scripts/dev-electron.mjs          # Dev harness (Vite + Electron together)
index.html vite.config.ts package.json tsconfig.json
```

## Tests

All tests run under Vitest (`yarn test` = run once, `yarn test:watch` = watch):

- `src/lib/**` - co-located frontend unit tests: timeline + playback utilities, bridge, bible assets/compose, export payloads, generation modes, run guard, model registry/capabilities/schema/polling, per-API transport shapes
- `electron/**` - main-process tests: migration validity + schema, media file I/O, export planning/args, every command module (CRUD, cascades, constraints) against in-memory SQLite

## Database Schema

Eleven tables with cascade deletes (SQLite via `node:sqlite`). The schema lives in `electron/migrations/` and is applied by the runner in `electron/db.ts`, tracked via SQLite's `user_version`. To change the schema, add a new numbered `.sql` file; never edit a shipped migration.

- **projects**: id, name, timestamps
- **storyboards**: id, project_id (FK), name, image_model, video_model, timestamps
- **shots**: id, storyboard_id (FK), order, duration, image_prompt, image_path (start frame), **end_frame_path**, video_prompt, video_path, status, timestamps
- **timeline_tracks / timeline_clips**: multi-track timeline state; each clip owns its trim window (trim_in/trim_out, source-file seconds) and may pin a video_version_id (NULL = follow the shot's current version)
- **settings**: key (PK), value, updated_at
- **image_versions / video_versions**: per-shot version trees (self-ref FK, edit_type, is_current)
- **bibles**: id, project_id (FK), name, is_default (auto-created per project via trigger)
- **bible_assets**: id, bible_id (FK), asset_type (`character`/`location`/`prop`/`style`/`reference`/`note`/`scene`), name, status
- **bible_asset_variants**: id, asset_id (FK), media_path, prompt, source_kind, status, is_primary (the images, including composed scene frames)

Database stored at `{appDataDir}/data/showbiz.db` (appId `com.showbiz.app`).

## Media Storage

- Start frame: `{appDataDir}/media/images/{shot-id}.{ext}`
- End frame: `{appDataDir}/media/images/{shot-id}_end.{ext}`
- Videos: `{appDataDir}/media/videos/{shot-id}.{ext}`
- Version images: `{appDataDir}/media/images/versions/{shot-id}/vN.{ext}`
- Bible variant images: `{appDataDir}/media/bible/{bible-id}/{variant-id}.{ext}`
- Masks: `{appDataDir}/media/masks/{shot-id}/{version-id}.png`
- Database stores relative paths; the renderer resolves them to `blob:` URLs via `electron-media-url.ts`

## Key Implementation Details

### Frame Composition
1. `composeImage(prompt, referenceImages[])` on the image transport interface takes a prompt plus one or more base64 reference images and returns a single image
2. The bible scene composer routes selected assets (their primary variant images) into `composeFrameAction`, which calls `composeImage` on the chosen engine
3. Implemented per engine: `google-image` (Gemini 2.5, `generateContent` multi-part), `google-interactions-image` (Gemini 3, Interactions API), `openai-image` (GPT Image 2, Responses API)
4. Composed frames are stored as bible `scene` variants, then assigned to a shot's start or end frame from the inspector

### Video Generation Flow
1. Mode is chosen from the shot's frames: a start frame (with optional end frame) gives image-to-video, otherwise text-to-video. Models declaring `inputs.endImage: "required"` are validated pre-submit; models with an `endFrameEndpoint` route start-only and start+end requests to different endpoints (e.g. Veo 3.1)
2. The renderer gets the API key (`get_api_key`), reads the frame(s) as base64, calls the model API. fal polling retries transient failures (network errors, 5xx, 429) up to 5 consecutive before giving up with the request id in the message
3. The renderer sends the video bytes to the main process (`save_and_complete_video` / video-version commands)
4. The main process saves the file + updates the DB, returns the path, the renderer resolves it to a `blob:` URL

### Video Export Flow
1. Timeline export: `buildExportClips` maps timeline clips to identity + trim + position; storyboard-mode assemble: `buildShotConcatClips` lays completed shots end to end using probed durations
2. `show_export_save_dialog` opens the native save dialog
3. `export_timeline_video` runs ffmpeg in the main process with progress streamed over IPC

### API Keys
- Stored in the DB `settings` table, managed via the Settings dialog
- Providers: `gemini`, `openai`, `ltx`, `kie`, `fal`, `replicate`
- Fetched on demand from the main process for a single API call; not persisted in the renderer

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
yarn dev          # Launch Electron dev mode (Vite + Electron shell)
yarn build        # Production Electron build (installers in dist-package/)
yarn dev:frontend # Frontend-only dev server (Vite)
yarn build:frontend # Frontend-only build
yarn build:electron # Bundle the main process (esbuild → dist-electron/)
yarn test         # Run all tests once (Vitest)
yarn test:watch   # Run tests in watch mode
```
