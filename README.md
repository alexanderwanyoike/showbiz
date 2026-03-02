# Showbiz

[![CI](https://github.com/alexanderwanyoike/showbiz/actions/workflows/ci.yml/badge.svg)](https://github.com/alexanderwanyoike/showbiz/actions/workflows/ci.yml)

AI-powered video storyboard desktop application. Generate images, turn them into videos, and assemble everything into a final movie — all from one interface.

## Download

Grab the latest release for your platform from [Releases](https://github.com/alexanderwanyoike/showbiz/releases):

| Platform | Formats |
|----------|---------|
| Linux | `.deb`, `.rpm`, `.AppImage` |
| macOS | `.dmg` |
| Windows | `.exe` (installer), `.msi` |

> **Requires [mpv](https://mpv.io/)** installed on your system for video playback.

## What It Does

Showbiz lets you create video storyboards:

1. Create **projects** to organize your work
2. Create **storyboards** within projects
3. Add **shots** to storyboards
4. **Generate images** for each shot (or upload your own)
5. **Generate videos** from those images
6. **Assemble** all shot videos into a final movie with a timeline editor

## Supported Models

### Image Generation

| Model | Provider |
|-------|----------|
| Imagen 4 | Google |
| Flux Kontext | Black Forest Labs |
| Seedream 4.5 | ByteDance |
| Nano Banana | the0 |
| Nano Banana Pro | the0 |

### Video Generation

| Model | Provider |
|-------|----------|
| Veo 3 | Google |
| Veo 3.1 Fast | Google |
| Kling 3 | Kuaishou |
| Kling 2.6 | Kuaishou |
| Seedance 2 | ByteDance |
| Seedance 1.5 | ByteDance |
| Hailuo 2.3 | MiniMax |
| Wan 2.6 | Alibaba |
| Sora 2 Pro | OpenAI |
| Grok Imagine | xAI |
| LTX Video | Lightricks |

## Tech Stack

- **Desktop**: [Tauri v2](https://v2.tauri.app/) (Rust backend + WebView frontend)
- **Frontend**: React 19, Vite, React Router v7, Tailwind CSS v4
- **Database**: SQLite via rusqlite
- **Video Playback**: mpv (embedded via X11/Win32 window handles)
- **Video Assembly**: FFmpeg.wasm (browser-based)
- **UI Components**: shadcn/ui + Radix

## Prerequisites

### Required

- [Node.js](https://nodejs.org/) (v20+)
- [Yarn](https://yarnpkg.com/) (`npm install -g yarn`)
- [Rust](https://rustup.rs/) (stable)
- [mpv](https://mpv.io/)

### Platform-Specific Dependencies

**Linux (Debian/Ubuntu):**
```bash
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev \
  librsvg2-dev libx11-dev mpv
```

**Linux (Fedora):**
```bash
sudo dnf install webkit2gtk4.1-devel gtk3-devel libappindicator-gtk3-devel \
  librsvg2-devel mpv
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

### API Keys

Configure in **Settings** within the app (or set environment variables):

- **`GEMINI_API_KEY`** — Google models (Imagen 4, Veo 3)
- **`LTX_API_KEY`** — LTX Video
- Additional keys for other providers as needed

## Development

```bash
yarn install
yarn dev              # Launch Tauri dev mode (frontend + Rust backend)
```

Other commands:
```bash
yarn build            # Production build
yarn dev:frontend     # Frontend-only dev server
yarn build:frontend   # Frontend-only build
yarn test             # Run tests
yarn test:watch       # Run tests in watch mode
```

## Architecture

**Hybrid backend**: Rust handles the database and file I/O. TypeScript handles API calls to model providers. API keys are fetched securely from Rust, used for the API call, then discarded.

Media files are served via Tauri's `asset://` protocol. Video playback uses mpv embedded directly into the application window via native window handles.

Model providers are **config-driven** — each model is defined as a JSON file in `src/lib/models/providers/`, making it straightforward to add new models without writing transport code.

## Notes

- On Wayland, the app runs under XWayland (`GDK_BACKEND=x11`) because mpv embedding requires X11 window handles.
- Set `SHOWBIZ_MPV_PATH=/path/to/mpv` to override mpv binary detection.
- Media files are stored in your system's app data directory (`~/.local/share/com.showbiz.app/` on Linux).

## License

Private — not open source.
