// THROWAWAY SPIKE — can Electron/Chromium host Showbiz's video playback?
// Loads the real media library plus a worst-case sparse-keyframe clip and
// exercises the failure modes that killed the WebKitGTK migration.
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");

const MEDIA_DIR = path.join(
  os.homedir(),
  ".local/share/com.showbiz.app/media/videos"
);
const EXTRA_DIR = "/tmp/showbiz-electron-spike";

function collectMp4s(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) collectMp4s(p, out);
    else if (entry.name.endsWith(".mp4")) out.push(p);
  }
  return out;
}

app.whenReady().then(() => {
  // Buffer-backed Range serving: spike files are a few MB, and slicing a
  // Buffer sidesteps every stream-abort edge case in Chromium's
  // open/probe/abort/reopen fetch pattern for media.
  ipcMain.handle("read-video", (_e, filePath) => fs.readFileSync(filePath));
  ipcMain.handle("list-videos", () => [
    ...collectMp4s(EXTRA_DIR),
    ...collectMp4s(MEDIA_DIR),
  ]);

  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    title: "Showbiz Electron Spike",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
    },
  });
  win.loadFile(path.join(__dirname, "spike.html"));
});

app.on("window-all-closed", () => app.quit());
