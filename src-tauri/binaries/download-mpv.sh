#!/usr/bin/env bash
#
# Download pre-built mpv binaries for Tauri sidecar bundling.
#
# Tauri expects binaries named: mpv-{target_triple}[.exe]
# Place this script in src-tauri/binaries/ and run it before `yarn build`.
#
# Usage:
#   ./download-mpv.sh              # download for current platform
#   ./download-mpv.sh all          # download for all platforms (CI)
#   ./download-mpv.sh <triple>     # download for specific target
#
set -euo pipefail
cd "$(dirname "$0")"

MPV_MACOS_VERSION="0.40.0"

download_macos_arm64() {
  echo "Downloading mpv for aarch64-apple-darwin..."
  local url="https://laboratory.stolendata.net/~djinn/mpv_osx/mpv-${MPV_MACOS_VERSION}.tar.gz"
  local tmp=$(mktemp -d)
  curl -fSL "$url" -o "$tmp/mpv.tar.gz" 2>/dev/null || {
    echo "ERROR: Could not download macOS mpv build."
    echo "Manual steps:"
    echo "  1. brew install mpv"
    echo "  2. cp \$(which mpv) src-tauri/binaries/mpv-aarch64-apple-darwin"
    rm -rf "$tmp"
    return 1
  }
  tar xzf "$tmp/mpv.tar.gz" -C "$tmp"
  # Find the mpv binary inside the extracted archive
  local mpv_bin=$(find "$tmp" -name "mpv" -type f | head -1)
  if [ -z "$mpv_bin" ]; then
    echo "ERROR: Could not find mpv binary in archive"
    rm -rf "$tmp"
    return 1
  fi
  cp "$mpv_bin" "mpv-aarch64-apple-darwin"
  chmod +x "mpv-aarch64-apple-darwin"
  # Strip codesign to prevent conflicts with Tauri's app signing
  if command -v codesign &>/dev/null; then
    codesign --remove-signature "mpv-aarch64-apple-darwin" 2>/dev/null || true
  fi
  rm -rf "$tmp"
  echo "  -> mpv-aarch64-apple-darwin"
}

download_macos_x86() {
  echo "Downloading mpv for x86_64-apple-darwin..."
  # Same universal build works for both archs if available
  if [ -f "mpv-aarch64-apple-darwin" ]; then
    cp "mpv-aarch64-apple-darwin" "mpv-x86_64-apple-darwin"
    echo "  -> mpv-x86_64-apple-darwin (copied from arm64 universal)"
    return
  fi
  echo "  Download arm64 first, or manually place mpv-x86_64-apple-darwin here."
}

download_windows() {
  echo "Downloading mpv for x86_64-pc-windows-msvc..."
  # Use shinchiro's mpv builds from GitHub
  local tmp=$(mktemp -d)

  # Get the latest release URL from shinchiro/mpv-winbuild-cmake
  local release_url
  release_url=$(curl -fsSL "https://api.github.com/repos/shinchiro/mpv-winbuild-cmake/releases/latest" \
    | grep -o '"browser_download_url":\s*"[^"]*x86_64[^"]*\.7z"' \
    | head -1 \
    | sed 's/"browser_download_url":\s*"//;s/"$//') || true

  if [ -z "$release_url" ]; then
    echo "ERROR: Could not find shinchiro mpv release URL."
    echo "Manual steps:"
    echo "  1. Download from https://github.com/shinchiro/mpv-winbuild-cmake/releases"
    echo "  2. Extract mpv.exe to src-tauri/binaries/mpv-x86_64-pc-windows-msvc.exe"
    echo "  3. Extract *.dll to src-tauri/binaries/mpv-libs/"
    rm -rf "$tmp"
    return 1
  fi

  curl -fSL "$release_url" -o "$tmp/mpv.7z" 2>/dev/null || {
    echo "ERROR: Could not download Windows mpv build."
    rm -rf "$tmp"
    return 1
  }

  if command -v 7z &>/dev/null; then
    7z x -o"$tmp/mpv" "$tmp/mpv.7z" >/dev/null
    # Copy mpv.exe as the sidecar binary
    cp "$tmp/mpv/mpv.exe" "mpv-x86_64-pc-windows-msvc.exe"
    echo "  -> mpv-x86_64-pc-windows-msvc.exe"
    # Copy DLLs to mpv-libs/ for Tauri resources bundling
    mkdir -p mpv-libs
    find "$tmp/mpv" -name "*.dll" -exec cp {} mpv-libs/ \;
    local dll_count=$(ls mpv-libs/*.dll 2>/dev/null | wc -l)
    echo "  -> mpv-libs/ ($dll_count DLLs)"
  else
    echo "  Need 7z to extract. Install p7zip-full or manually extract."
  fi
  rm -rf "$tmp"
}

download_linux() {
  echo "Setting up mpv for x86_64-unknown-linux-gnu..."
  # On Linux, prefer system mpv since shared libs are complex to bundle.
  # For deb/rpm the package dependency handles it; this is for AppImage builds.
  if command -v mpv &>/dev/null; then
    cp "$(which mpv)" "mpv-x86_64-unknown-linux-gnu"
    chmod +x "mpv-x86_64-unknown-linux-gnu"
    echo "  -> mpv-x86_64-unknown-linux-gnu (copied from system)"
  else
    echo "  Install mpv first: sudo apt install mpv (or equivalent)"
    return 1
  fi
}

detect_target() {
  local os=$(uname -s)
  local arch=$(uname -m)
  case "$os-$arch" in
    Darwin-arm64)  echo "aarch64-apple-darwin" ;;
    Darwin-x86_64) echo "x86_64-apple-darwin" ;;
    Linux-x86_64)  echo "x86_64-unknown-linux-gnu" ;;
    Linux-aarch64) echo "aarch64-unknown-linux-gnu" ;;
    MINGW*|MSYS*)  echo "x86_64-pc-windows-msvc" ;;
    *)             echo "unknown"; return 1 ;;
  esac
}

download_for_target() {
  case "$1" in
    aarch64-apple-darwin)       download_macos_arm64 ;;
    x86_64-apple-darwin)        download_macos_x86 ;;
    x86_64-pc-windows-msvc)     download_windows ;;
    x86_64-unknown-linux-gnu)   download_linux ;;
    aarch64-unknown-linux-gnu)  download_linux ;;
    *)                          echo "Unknown target: $1"; return 1 ;;
  esac
}

case "${1:-}" in
  all)
    download_macos_arm64
    download_macos_x86
    download_windows
    download_linux
    ;;
  "")
    target=$(detect_target)
    download_for_target "$target"
    ;;
  *)
    download_for_target "$1"
    ;;
esac

echo ""
echo "Done. Binaries in src-tauri/binaries/:"
ls -la mpv-* 2>/dev/null || echo "  (none yet)"
