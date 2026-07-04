> **Status: complete (July 2026).** All five phases shipped; Electron is the only shell. Kept as a historical record.

# Electron Migration

Move Showbiz from Tauri (Rust + per-platform webviews) to Electron (Chromium
everywhere + Node main process). Verdict basis: the WebKitGTK migration
post-mortem (PRs #58/#60/#61) and the Electron spike (PR #64), which showed
pixel-perfect scrubbing under 25-seeks/second storms on a 1-keyframe clip,
DOM overlays over moving video, four simultaneous decodes, and working audio
on the exact hardware where WebKitGTK failed.

## Why (what this deletes)

| Today (Tauri) | After (Electron) |
| --- | --- |
| mpv stack: X11 child windows, geometry sync, libmpv render API, IPC socket, sidecar bundling | HTML5 `<video>` (the closed #60/#61 players port directly) |
| `http_request` JSON-only proxy (webview can't fetch cross-origin) | plain main-process `fetch`; **multipart returns** for providers |
| FFmpeg.wasm + CSP/COEP/unpkg/worker workarounds | spawned native ffmpeg (`ffmpeg-static`) |
| `asset://` protocol + cache-busting + GStreamer quirks | bytes over IPC → blob URLs (already the player architecture) |
| `WEBKIT_DISABLE_DMABUF_RENDERER`, `GDK_BACKEND=x11`, keyframe normalization, WebKitGTK armor | none needed |
| Rust backend (rusqlite, media I/O) | Node main (better-sqlite3, fs) — same schema, same media layout |

Costs accepted: ~100MB bundles, Chromium's RAM. Normal for a video tool.

## Ground rules

- **Same DB, same media directory, same command names.** Both shells run
  against the same data during the whole migration; nothing is converted.
- **The Rust tests are the spec.** Every ported module must land with Vitest
  (node environment) tests mirroring the Rust `#[cfg(test)]` cases before the
  module is considered done. TDD as usual.
- **The frontend talks to a runtime bridge** (`src/lib/bridge.ts`): Tauri
  `invoke` or Electron `ipcRenderer.invoke` chosen at runtime. `tauri-api.ts`
  changes one import; components change nothing.
- **Verification is first-class**: Electron runs with
  `--remote-debugging-port` in dev, so agents get real console/CDP access
  (no more log-tap hacks). Every phase ends with a driven live check.

## Phases

### Phase 0 — Shell scaffold (main assistant)
`electron/` dir: main.ts (window, dev-loads vite at :1420), preload.ts
(contextBridge `invoke` shim + `readMediaBytes`), `bridge.ts` in the
frontend, `yarn dev:electron`. Acceptance: the existing React app boots in
Electron, navigates, and lists projects via one ported read command.

### Phase 1 — Backend port (delegated: Opus 4.8 + Codex, one module per agent)
Port the ~40 Rust commands to Node main-process modules with identical names
and JSON shapes: `projects`, `shots`, `bibles`, `settings` (+ key storage),
`image_versions`, `video_versions`, `timeline`, `media`. better-sqlite3 +
the two `.sql` migrations under the same `user_version` discipline.
`http_request` ports as a thin main-process fetch (same signature first;
multipart liberation is a later cleanup). Each module = one worktree, one
PR, tests mirroring the Rust suite, reviewed by the main assistant and
cross-reviewed by `codex:review`.

### Phase 2 — Media + players (main assistant)
Blob-over-IPC media serving; port the shot preview (#61) and the NLE player
(#60) from the closed branches; strip WebKitGTK-specific armor (keyframe
snapping, freeze-frame canvas, open-serialization) after a green live run —
bounded waits may stay as cheap insurance. Thumbnails/durations already use
HTMLVideoElement and just work.

### Phase 3 — Native export (delegated, after 1+2)
Replace FFmpeg.wasm with spawned ffmpeg: timeline-order concat, gaps as
black, audio passthrough, export settings (resolution/fps/preset). Deletes
the wasm loading stack and its CSP/COEP configuration.

### Phase 4 — Parity QA + cutover (main assistant + Alex)
Side-by-side checklist over the same DB (projects, bible, generation,
versions, timeline editing, export, settings). Then Electron becomes
`yarn dev`/`yarn build` default; Tauri kept one release as fallback.
Packaging: electron-builder (AppImage/deb, dmg, nsis) + CI.

### Phase 5 — Deletion sweep (delegated)
Remove `src-tauri/`, mpv binaries and download scripts, Tauri deps and
config, wasm workarounds, stale docs/memory. CLAUDE.md rewritten. The
codebase ends smaller than it started.

## Unlocked afterwards (the point of all this)
Text/image overlay clips rendered in DOM, transitions, audio tracks with
waveforms, Remotion-style programmatic scenes, and a shared editing engine
with forgecut.
