#!/usr/bin/env bash
#
# Download pre-built mpv binaries for Tauri sidecar bundling.
#
# Uses official mpv releases from https://github.com/mpv-player/mpv/releases
#
# Tauri expects binaries named: mpv-{target_triple}[.exe]
# Place this script in src-tauri/binaries/ and run it before `yarn build`.
#
# Usage:
#   ./download-mpv.sh              # download for current platform
#   ./download-mpv.sh all          # download for all platforms
#   ./download-mpv.sh <triple>     # download for specific target
#
set -euo pipefail
cd "$(dirname "$0")"

MPV_VERSION="v0.41.0"
MPV_BASE_URL="https://github.com/mpv-player/mpv/releases/download/${MPV_VERSION}"

download_macos_arm64() {
  local target="aarch64-apple-darwin"
  echo "Downloading mpv for ${target}..."
  local url="${MPV_BASE_URL}/mpv-${MPV_VERSION}-macos-14-arm.zip"
  local tmp=$(mktemp -d)
  trap "rm -rf '$tmp'" RETURN

  curl -fSL "$url" -o "$tmp/mpv.zip" || {
    echo "ERROR: Could not download macOS ARM mpv from:"
    echo "  $url"
    return 1
  }

  unzip -q "$tmp/mpv.zip" -d "$tmp/out"
  # Official release contains mpv.app bundle
  local mpv_bin=$(find "$tmp/out" -path "*/Contents/MacOS/mpv" -type f | head -1)
  if [ -z "$mpv_bin" ]; then
    echo "ERROR: Could not find mpv binary in archive"
    echo "Archive contents:"
    find "$tmp/out" -type f | head -20
    return 1
  fi

  cp "$mpv_bin" "mpv-${target}"
  chmod +x "mpv-${target}"
  # Strip codesign to prevent conflicts with Tauri's app signing
  codesign --remove-signature "mpv-${target}" 2>/dev/null || true
  echo "  -> mpv-${target}"
}

download_macos_x86() {
  local target="x86_64-apple-darwin"
  echo "Downloading mpv for ${target}..."
  local url="${MPV_BASE_URL}/mpv-${MPV_VERSION}-macos-15-intel.zip"
  local tmp=$(mktemp -d)
  trap "rm -rf '$tmp'" RETURN

  curl -fSL "$url" -o "$tmp/mpv.zip" || {
    echo "ERROR: Could not download macOS Intel mpv from:"
    echo "  $url"
    return 1
  }

  unzip -q "$tmp/mpv.zip" -d "$tmp/out"
  local mpv_bin=$(find "$tmp/out" -path "*/Contents/MacOS/mpv" -type f | head -1)
  if [ -z "$mpv_bin" ]; then
    echo "ERROR: Could not find mpv binary in archive"
    return 1
  fi

  cp "$mpv_bin" "mpv-${target}"
  chmod +x "mpv-${target}"
  codesign --remove-signature "mpv-${target}" 2>/dev/null || true
  echo "  -> mpv-${target}"
}

download_windows() {
  local target="x86_64-pc-windows-msvc"
  echo "Downloading mpv for ${target}..."
  local url="${MPV_BASE_URL}/mpv-${MPV_VERSION}-${target}.zip"
  local tmp=$(mktemp -d)
  trap "rm -rf '$tmp'" RETURN

  curl -fSL "$url" -o "$tmp/mpv.zip" || {
    echo "ERROR: Could not download Windows mpv from:"
    echo "  $url"
    return 1
  }

  unzip -q "$tmp/mpv.zip" -d "$tmp/out"
  # Find mpv.exe in extracted tree
  local mpv_exe
  mpv_exe=$(find "$tmp/out" -name "mpv.exe" -type f | head -1)
  if [ -z "$mpv_exe" ]; then
    echo "ERROR: Could not find mpv.exe in archive"
    echo "Archive contents:"
    find "$tmp/out" -type f | head -20
    return 1
  fi

  local mpv_dir
  mpv_dir=$(dirname "$mpv_exe")
  cp "$mpv_exe" "mpv-${target}.exe"
  echo "  -> mpv-${target}.exe"

  # Copy DLLs from the same directory for Tauri resources bundling
  mkdir -p mpv-libs
  local dll_count=0
  while IFS= read -r -d '' dll; do
    cp "$dll" mpv-libs/
    dll_count=$((dll_count + 1))
  done < <(find "$mpv_dir" -maxdepth 1 -name "*.dll" -print0)
  echo "  -> mpv-libs/ (${dll_count} DLLs)"
}

download_linux() {
  local target="x86_64-unknown-linux-gnu"
  echo "Setting up mpv for ${target}..."
  # On Linux, use system mpv. For deb/rpm the package dependency handles it.
  # This is needed for AppImage builds.
  if command -v mpv &>/dev/null; then
    cp "$(which mpv)" "mpv-${target}"
    chmod +x "mpv-${target}"
    echo "  -> mpv-${target} (copied from system)"
  else
    echo "ERROR: mpv not found. Install it first: sudo apt install mpv"
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
