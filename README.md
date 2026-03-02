# Showbiz

[![CI](https://github.com/alexanderwanyoike/showbiz/actions/workflows/ci.yml/badge.svg)](https://github.com/alexanderwanyoike/showbiz/actions/workflows/ci.yml)

AI-powered video storyboard desktop app. Generate images, turn them into videos, trim and arrange them on a timeline, and export a final movie — all from one interface.

## Download

Grab the latest release for your platform from [**Releases**](https://github.com/alexanderwanyoike/showbiz/releases):

| Platform | Formats |
|----------|---------|
| Linux | `.deb`, `.rpm`, `.AppImage` |
| macOS | `.dmg` |
| Windows | `.exe` (installer), `.msi` |

You'll also need [**mpv**](https://mpv.io/) installed for video playback (see [Prerequisites](#prerequisites) below).

## Features

- **Project organization** — create projects, each containing multiple storyboards
- **Shot-based workflow** — add shots to a storyboard, each with its own image and video prompt
- **Multi-model image generation** — generate images with Imagen 4, Flux Kontext, Seedream, or Gemini-based models, or upload your own
- **Image editing** — edit generated images with models that support it (Flux Kontext, Nano Banana, Nano Banana Pro)
- **Image version tree** — every generation/edit creates a version; switch between versions non-destructively
- **Multi-model video generation** — generate videos from images using 10+ models with configurable duration, resolution, and aspect ratio
- **Video version tree** — regenerate videos and keep all versions; switch freely
- **Audio support** — models like Veo 3, Kling 3, and Seedance 1.5 generate videos with synchronized audio
- **Timeline editor** — arrange shots, trim clips, preview playback
- **Video assembly** — export all shots into a single video via FFmpeg.wasm (runs entirely in-browser)
- **Embedded video playback** — mpv player embedded directly into the app window
- **Dark/light theme** — system-aware with manual toggle
- **Config-driven models** — add new models by dropping a JSON file (no code changes)

## Supported Models

### Image Generation

| Model | Provider | API Key | Editing |
|-------|----------|---------|---------|
| Imagen 4 | Google | Gemini | - |
| Nano Banana | Google (Gemini 2.5 Flash) | Gemini | Yes |
| Nano Banana Pro | Google (Gemini 3 Pro) | Gemini | Yes |
| Flux Kontext | Black Forest Labs via kie.ai | kie | Yes |
| Seedream 4.5 | ByteDance via kie.ai | kie | - |

### Video Generation

| Model | Provider | API Key | Duration | Audio |
|-------|----------|---------|----------|-------|
| Veo 3 | Google | Gemini | 8s | Yes |
| Veo 3.1 Fast | Google | Gemini | 8s | Yes |
| Kling 3.0 | Kuaishou via kie.ai | kie | 3–15s | Yes |
| Kling 2.6 | Kuaishou via kie.ai | kie | 5–10s | Yes |
| Seedance 1.5 Pro | ByteDance via kie.ai | kie | 4–12s | Yes |
| Hailuo 2.3 Pro | MiniMax via kie.ai | kie | 6s | - |
| Wan 2.6 | Alibaba via kie.ai | kie | 5–15s | - |
| Sora 2 Pro | OpenAI via kie.ai | kie | 10–15s | - |
| Grok Imagine | xAI via kie.ai | kie | 6–10s | - |
| LTX Video | Lightricks | LTX | 8s | - |

All models support both text-to-video and image-to-video generation.

## API Keys

You need at least one API key to generate content. Configure them in **Settings** within the app, or set environment variables:

| Key | Environment Variable | Models |
|-----|---------------------|--------|
| **Gemini** | `GEMINI_API_KEY` | Imagen 4, Nano Banana, Nano Banana Pro, Veo 3, Veo 3.1 Fast |
| **kie.ai** | `KIE_API_KEY` | Flux Kontext, Seedream, Kling, Seedance, Hailuo, Wan, Sora, Grok |
| **LTX** | `LTX_API_KEY` | LTX Video |

Keys are stored in the local SQLite database and never leave your machine except to make API calls.

## Tech Stack

- **Desktop**: [Tauri v2](https://v2.tauri.app/) — Rust backend, WebView frontend
- **Frontend**: React 19, Vite, React Router v7
- **Styling**: Tailwind CSS v4, shadcn/ui, Radix
- **Backend**: Rust — SQLite (rusqlite), file I/O, mpv IPC
- **Video Playback**: mpv embedded via native window handles (X11 on Linux, Win32 on Windows)
- **Video Assembly**: FFmpeg.wasm — runs entirely in the browser WebView
- **Testing**: Vitest

## Architecture

Hybrid Tauri v2 app — Rust backend owns persistent state (SQLite, file system, mpv process), TypeScript frontend owns the UI and calls external model APIs. Models are config-driven: add a JSON file to `src/lib/models/providers/` and it's auto-discovered at build time with zero TypeScript needed.

See [**docs/architecture.md**](docs/architecture.md) for the full architecture documentation, including system diagrams, generation flow, model registry internals, version trees, and database schema.

## Prerequisites

### Required

- [Node.js](https://nodejs.org/) (v20+)
- [Yarn](https://yarnpkg.com/) (`npm install -g yarn`)
- [Rust](https://rustup.rs/) (stable)
- [mpv](https://mpv.io/) — required for video playback

### Platform-Specific Dependencies

**Linux (Debian/Ubuntu):**
```bash
# Tauri + X11 dependencies
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev \
  librsvg2-dev libx11-dev patchelf

# mpv
sudo apt install mpv
```

**Linux (Fedora):**
```bash
sudo dnf install webkit2gtk4.1-devel gtk3-devel libappindicator-gtk3-devel \
  librsvg2-devel
sudo dnf install mpv
```

**macOS:**
```bash
xcode-select --install
brew install mpv
```

**Windows:**
```powershell
scoop install mpv    # or: winget install mpv
```

## Development

```bash
yarn install
yarn dev              # Launch Tauri dev mode (frontend + Rust backend)
```

Other commands:
```bash
yarn build            # Production build
yarn dev:frontend     # Frontend-only dev server (Vite)
yarn build:frontend   # Frontend-only build
yarn test             # Run tests
yarn test:watch       # Run tests in watch mode
```

## Platform Notes

- **Wayland**: The app runs under XWayland (`GDK_BACKEND=x11`) because mpv embedding requires X11 window handles.
- **mpv path override**: Set `SHOWBIZ_MPV_PATH=/path/to/mpv` to use a custom mpv binary.
- **Data directory**: Media and database are stored in your system's app data directory (`~/.local/share/com.showbiz.app/` on Linux).
- **FFmpeg.wasm**: Requires COOP/COEP headers for SharedArrayBuffer — configured automatically in `vite.config.ts`.

## License

[MIT](LICENSE)
