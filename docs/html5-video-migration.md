# HTML5 Video Migration

Replace mpv with HTML5 `<video>` for all playback, deleting the largest
native subsystem in the app (X11 child windows, geometry sync, macOS render
API, position polling) and unlocking DOM overlays, real multi-track preview,
and programmatic scene assets.

**Status**: Phase 1 in progress. Spike verdict in
[PR #58](https://github.com/alexanderwanyoike/showbiz/pull/58): GREEN.

## Why this is possible now

mpv was adopted (commit `c0615b4`, Feb 2026) because WebKitGTK's DMA-BUF
renderer black-framed video on Intel+NVIDIA hybrid GPUs. Since then
`WEBKIT_DISABLE_DMABUF_RENDERER=1` was added to `main.rs`, and the spike
confirmed HTML5 video renders, seeks, and plays multiple streams on the exact
machine that originally failed.

## Hard-won constraints (read before writing any code)

1. **`asset://` URLs cannot feed `<video>` on Linux.** WebKitGTK delegates
   media to GStreamer, which doesn't understand Tauri's custom scheme and
   fails with `MEDIA_ERR_SRC_NOT_SUPPORTED` (code 4). Load clips as **blob
   URLs**: `fetch(assetUrl) → blob → URL.createObjectURL`. This is the same
   path `thumbnail-generator.ts` has used reliably since the beginning.
   Revoke object URLs when clips unload.
2. **At most 2 mounted `<video>` elements.** The spike showed the 4th
   concurrent software-decode pipeline failing. The player needs exactly two:
   the active clip and the preloaded next clip (the pre-mpv `useVideoPool`
   pattern, deleted in PR #54, is the right shape).
3. **AI-generated clips have 1-2 keyframes total**, so scrubbing shows
   decoder smear until normalization has run. Phase 1 fixes this at the media
   layer (`src-tauri/src/video_normalize.rs`); the player must NOT try to
   compensate.
4. **`WEBKIT_DISABLE_DMABUF_RENDERER=1` in `main.rs` is load-bearing** for
   video rendering on hybrid-GPU Linux. Do not remove it.
5. Keep `yarn test --run`, `yarn build:frontend`, `cargo test`, `cargo check`
   green. TDD: extract player sequencing logic into `src/lib/` and unit-test
   it (see `src/lib/timeline-utils.ts` for the pattern).

## Phases

### Phase 1 — Normalize videos (DONE in this PR, prerequisite for all others)

Every saved video is re-encoded to a dense keyframe cadence (x264, GOP 12,
CRF 18, audio copied); the existing library is backfilled by a background
thread on startup. Idempotent: already-dense files are only probed. Uses a
bundled ffmpeg sidecar when present, else system ffmpeg, else skips.

### Phase 2 — HTML5 storyboard preview (delegatable)

Replace the mpv path in `src/components/ShotPreview.tsx` with a `<video>`
element (blob URL). Keep the existing transport state machine
(`resolveToggleAction` in `src/lib/video-preview.ts`) but drive it from real
`timeupdate`/`ended` events instead of the 250ms position poll.
mpv commands (`mpv_start`/`mpv_stop`/...) must no longer be invoked from this
component. Acceptance: play/pause/step/scrub a shot with frame-accurate
seeking; overlay the existing generating badge on top of the playing video.

### Phase 3 — HTML5 NLE timeline player (complex; NOT for delegation)

Replace `useMpvPlayer` + `PreviewPlayer` + the polling loop in
`useTimelinePlayback` with a two-element `<video>` pool driven by
`timeupdate` events. Sequencing stays in `src/lib/timeline-utils.ts`
(`resolvePlayheadState` etc. are player-agnostic and keep their tests).
Gaps render as an empty black container (no mpv hide/show hacks). The
playhead, clip transitions, and preload logic are the hard part.

### Phase 4 — Delete the mpv stack (delegatable, after 2+3 are verified)

Remove `src-tauri/src/commands/mpv/` (all platforms), mpv command
registrations in `main.rs`, `useMpvPlayer.ts`, mpv sidecar bundling in
`tauri.conf.json`/CI, the `GDK_BACKEND=x11` override if nothing else needs
X11, and every doc/memory reference. `cargo clippy` must stay clean.

## Follow-ups unlocked (not part of this migration)

- Text/image overlays as timeline clips rendered in DOM
- Remotion/Manim-style programmatic scene assets (shared engine with forgecut)
- Native ffmpeg sidecar export (replaces FFmpeg.wasm; gaps as black, audio
  mixing, export settings)
