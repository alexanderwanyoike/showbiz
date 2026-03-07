#!/usr/bin/env bash
#
# Download pre-built mpv binaries for Tauri bundling.
#
# Uses official mpv releases from https://github.com/mpv-player/mpv/releases
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

collect_deps() {
  # Recursively copy non-system dylib dependencies into a target directory.
  # DYLD_LIBRARY_PATH is set at runtime so we don't need install_name_tool —
  # just having the dylibs in the same directory is enough.
  local dylib="$1"
  local lib_dir="$2"

  while IFS= read -r dep; do
    # Skip system libraries
    case "$dep" in
      /usr/lib/*|/System/*) continue ;;
    esac
    local base
    base="$(basename "$dep")"
    # Skip if already collected
    if [ -f "$lib_dir/$base" ]; then
      continue
    fi
    if [ ! -f "$dep" ]; then
      echo "  WARN: dependency not found: $dep"
      continue
    fi
    cp "$dep" "$lib_dir/$base"
    # Recurse into the newly copied dep
    collect_deps "$lib_dir/$base" "$lib_dir"
  done < <(otool -L "$dylib" | awk 'NR>1 {print $1}')
}

build_libmpv_macos() {
  # Build libmpv.2.dylib from the mpv source at the pinned version.
  # Requires: meson, ninja, pkg-config, and ffmpeg headers (brew install meson ninja ffmpeg)
  for cmd in meson ninja pkg-config; do
    if ! command -v "$cmd" &>/dev/null; then
      echo "ERROR: '$cmd' is required to build libmpv from source."
      echo "  Install with: brew install meson ninja pkg-config"
      return 1
    fi
  done

  if ! pkg-config --exists libavcodec 2>/dev/null; then
    echo "ERROR: ffmpeg dev libraries not found (needed by libmpv)."
    echo "  Install with: brew install ffmpeg"
    return 1
  fi

  local build_tmp=$(mktemp -d)
  trap "rm -rf '$build_tmp'" RETURN

  echo "  Cloning mpv ${MPV_VERSION}..."
  git clone --depth 1 --branch "${MPV_VERSION}" \
    https://github.com/mpv-player/mpv.git "$build_tmp/mpv" 2>&1 | tail -1

  echo "  Configuring meson build..."
  meson setup "$build_tmp/build" "$build_tmp/mpv" \
    --buildtype=release \
    -Dlibmpv=true \
    -Dcplayer=false \
    -Dtests=false \
    -Dmanpage-build=disabled \
    -Dhtml-build=disabled \
    2>&1 | tail -3

  echo "  Building libmpv..."
  ninja -C "$build_tmp/build" 2>&1 | tail -3

  # Find and copy the built dylib
  local built_dylib
  built_dylib=$(find "$build_tmp/build" -name "libmpv*.dylib" -type f | head -1)
  if [ -z "$built_dylib" ]; then
    echo "ERROR: libmpv dylib not found after build."
    echo "  Build directory contents:"
    find "$build_tmp/build" -name "libmpv*" | head -10
    return 1
  fi

  cp "$built_dylib" "mpv-macos/lib/libmpv.2.dylib"
  ln -sf "libmpv.2.dylib" "mpv-macos/lib/libmpv.dylib"

  # Collect all transitive non-system dependencies (Homebrew libs etc.)
  # so end-user machines don't need Homebrew installed.
  echo "  Collecting transitive dependencies..."
  collect_deps "mpv-macos/lib/libmpv.2.dylib" "mpv-macos/lib"
  local dep_count
  dep_count=$(find "mpv-macos/lib" -name "*.dylib" -type f | wc -l | tr -d ' ')
  echo "  -> collected ${dep_count} dylibs total"

  # Ad-hoc codesign everything
  find "mpv-macos/lib" -type f -exec codesign --force --sign - {} 2>/dev/null \; || true

  echo "  -> built and installed libmpv.2.dylib from source (${MPV_VERSION})"
}

download_macos() {
  local arch="$1"  # arm or intel
  local target="$2" # aarch64-apple-darwin or x86_64-apple-darwin
  local variant="$3" # macos-14-arm or macos-15-intel
  echo "Downloading mpv for ${target}..."
  local url="${MPV_BASE_URL}/mpv-${MPV_VERSION}-${variant}.zip"
  local tmp=$(mktemp -d)
  trap "rm -rf '$tmp'" RETURN

  curl -fSL "$url" -o "$tmp/mpv.zip" || {
    echo "ERROR: Could not download macOS mpv from:"
    echo "  $url"
    return 1
  }

  unzip -q "$tmp/mpv.zip" -d "$tmp/out"
  # Release zip contains mpv.tar.gz which has mpv.app bundle inside
  local inner_tar=$(find "$tmp/out" -name "mpv.tar.gz" -type f | head -1)
  if [ -n "$inner_tar" ]; then
    tar xzf "$inner_tar" -C "$tmp/out"
  fi

  local mpv_app=$(find "$tmp/out" -name "mpv.app" -type d | head -1)
  if [ -z "$mpv_app" ]; then
    echo "ERROR: Could not find mpv.app in archive"
    echo "Archive contents:"
    find "$tmp/out" -maxdepth 3 | head -20
    return 1
  fi

  # Flatten mpv.app into mpv-macos/ — Tauri's resource glob can't handle
  # .app bundles (symlinks, nested dirs). Simple flat structure works.
  rm -rf "mpv-macos"
  mkdir -p "mpv-macos/lib"

  # Copy the mpv binary
  cp "$mpv_app/Contents/MacOS/mpv" "mpv-macos/mpv"
  chmod +x "mpv-macos/mpv"

  # Collect ALL dylibs from the bundle (resolve symlinks to real files)
  local lib_count=0
  # Check both common locations: MacOS/lib/ and Frameworks/
  for search_dir in "$mpv_app/Contents/MacOS/lib" "$mpv_app/Contents/Frameworks"; do
    if [ -d "$search_dir" ]; then
      while IFS= read -r -d '' dylib; do
        local real_file="$(readlink -f "$dylib")"
        local base_name="$(basename "$dylib")"
        cp "$real_file" "mpv-macos/lib/${base_name}"
        lib_count=$((lib_count + 1))
      done < <(find "$search_dir" -name "*.dylib" -print0)
    fi
  done

  # Also grab any .so files (some mpv plugins use .so)
  for search_dir in "$mpv_app/Contents/MacOS/lib" "$mpv_app/Contents/Frameworks"; do
    if [ -d "$search_dir" ]; then
      while IFS= read -r -d '' so; do
        local real_file="$(readlink -f "$so")"
        local base_name="$(basename "$so")"
        cp "$real_file" "mpv-macos/lib/${base_name}"
        lib_count=$((lib_count + 1))
      done < <(find "$search_dir" -name "*.so" -print0)
    fi
  done

  # Ad-hoc sign everything
  codesign --force --sign - "mpv-macos/mpv" 2>/dev/null || true
  find "mpv-macos/lib" -type f -exec codesign --force --sign - {} 2>/dev/null \; || true

  echo "  -> mpv-macos/mpv + ${lib_count} dylibs"

  # The official mpv release statically links libmpv into the binary —
  # libmpv.dylib is NOT in the bundle. Build it from source (issue #20).
  if ! ls mpv-macos/lib/libmpv*.dylib 1>/dev/null 2>&1; then
    echo "  libmpv.dylib not in release bundle, building from source..."
    build_libmpv_macos
  fi

  # Keep mpv.app placeholder for Tauri resource validation on other platforms
  rm -rf "mpv.app"
  mkdir -p "mpv.app"
}

download_macos_arm64() {
  download_macos arm aarch64-apple-darwin macos-14-arm
}

download_macos_x86() {
  download_macos intel x86_64-apple-darwin macos-15-intel
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
  echo "Linux: mpv is a system dependency (deb/rpm 'depends' handles it)."
  echo "  No sidecar needed."
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

# Ensure placeholder dirs exist for non-macOS builds (Tauri validates resources)
mkdir -p mpv.app
mkdir -p mpv-macos/lib

echo ""
echo "Done. Binaries in src-tauri/binaries/:"
ls -la mpv-* 2>/dev/null || echo "  (none yet)"
if [ -f "mpv-macos/mpv" ]; then
  echo "  mpv-macos/ ($(find mpv-macos -type f | wc -l | tr -d ' ') files)"
fi
