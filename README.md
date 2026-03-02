# Showbiz

AI-powered video storyboard desktop application. Generate images with Imagen 4, turn them into videos with Veo 3, and assemble everything into a final movie.

## Prerequisites

### Required

- [Node.js](https://nodejs.org/) (v18+)
- [Yarn](https://yarnpkg.com/) (`npm install -g yarn`)
- [Rust](https://rustup.rs/) (latest stable)
- [mpv](https://mpv.io/) - required for video playback

### Platform-specific

**Linux (Debian/Ubuntu):**
```bash
# Tauri dependencies
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev

# mpv for video playback
sudo apt install mpv

# X11 libs (usually already installed)
sudo apt install libx11-dev
```

**Linux (Fedora):**
```bash
sudo dnf install webkit2gtk4.1-devel gtk3-devel libappindicator-gtk3-devel librsvg2-devel
sudo dnf install mpv
```

**macOS:**
```bash
# Xcode command line tools (if not already installed)
xcode-select --install

# mpv
brew install mpv
```

**Windows:**
```powershell
# mpv (pick one)
scoop install mpv
# or
winget install mpv
# or download from https://mpv.io and add to PATH
```

### API Keys

You'll need at least one of these (configured in Settings within the app):

- **Gemini API key** - for Imagen 4 (image generation) and Veo 3 (video generation)
- **LTX API key** - optional, for LTX Video generation

## Development

```bash
yarn install
yarn dev          # Launch Tauri dev mode (frontend + Rust backend)
```

Other commands:
```bash
yarn build            # Production build (.deb/.AppImage on Linux, .dmg on macOS, .msi on Windows)
yarn dev:frontend     # Frontend-only dev server (Vite)
yarn build:frontend   # Frontend-only build
```

## Notes

- On Wayland desktops, the app automatically runs under XWayland (`GDK_BACKEND=x11`) because mpv's embedded playback requires X11 window handles.
- Set `SHOWBIZ_MPV_PATH=/path/to/mpv` to override mpv binary detection.
- Media files are stored in your system's app data directory (`~/.local/share/com.showbiz.app/` on Linux).
