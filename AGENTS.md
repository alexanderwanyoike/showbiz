# Showbiz — Agent Instructions

AI-powered video storyboard desktop application (Electron + React 19).

## Rules

### 1. Research, don't guess
**Always research before acting** — this applies to everything: bug fixes, new features, architecture decisions, planning, and ideation. Read source code, check docs, search the web, review GitHub issues. Understand the problem space before proposing or implementing a solution. Never trial-and-error your way through.

### 2. TDD for all TypeScript changes
Write a **failing test first**, then implement the fix/feature to make it pass.
- Frontend: Vitest, tests co-located in `src/lib/*.test.ts`
- Main process: Vitest, tests co-located in `electron/**/*.test.ts` (in-memory SQLite)

### 3. Clean code practices
- Meaningful names, small focused functions, single responsibility
- No dead code, no commented-out code, no TODO comments without a tracking issue
- DRY — extract shared logic, but don't abstract prematurely
- Consistent patterns: follow existing codebase conventions
- Handle errors explicitly — no silent swallows

### 4. Always use yarn (never npm)

### 5. Always check the build
Run `yarn build:frontend` and `yarn build:electron` before considering work done. For packaging changes, run `yarn build` (full electron-builder pass).

## Architecture

- **Frontend**: React 19 + Vite (`src/`), HashRouter (packaged file:// asar paths)
- **Backend**: Electron main process (`electron/`) — SQLite via `node:sqlite`, file I/O, native ffmpeg export
- **Bridge**: preload exposes `window.showbiz`; `src/lib/bridge.ts` wraps it, `src/lib/backend-api.ts` types every command
- **Media**: blob-over-IPC (`src/lib/electron-media-url.ts` caches blob: URLs); do NOT use `protocol.handle` streaming for media
- **Video playback**: HTML5 `<video>` (Chromium)
- **Video export**: native ffmpeg spawned in main; renderer sends clip identity + trims, main resolves paths from the DB

## Commands

```bash
yarn dev              # Launch Electron dev mode (Vite + Electron)
yarn build            # Full electron-builder package (dist-package/)
yarn build:frontend   # Frontend production build
yarn build:electron   # Bundle main process (esbuild)
yarn test             # Run all Vitest tests once
```

## Git Workflow

- `main ← dev ← feature branches`
- Feature branches: off `dev`, PR back to `dev`
- `main`: stable releases only, merged from `dev`
- Tags on `main` trigger release builds (draft GitHub Release with artifacts)
- Never force-push tags — bump patch version instead
- Always new commits, never amend

## Key Constraints

- Migrations (`electron/migrations/*.sql`) are append-only; never edit a shipped one
- IPC command names and JSON shapes are snake_case (preserved from the original Rust backend) — keep new commands consistent
- Cross-origin API calls go through the main-process `http_request` JSON proxy; providers must use JSON endpoints (not multipart)
- In-place media overwrites must invalidate the blob URL cache (`invalidate=true`)

## Test Structure

- `src/lib/**/*.test.ts` — timeline utils, bridge, bible assets/compose, export payloads, generation modes, model registry/config/polling, transport request/response shapes
- `electron/**/*.test.ts` — migrations + schema, media file I/O, export planning/args, every command module (CRUD, cascades, constraints)
