import fs from "fs";
import path from "path";

// Media directories
const MEDIA_DIR = path.join(process.cwd(), "media");
const IMAGES_DIR = path.join(MEDIA_DIR, "images");
const VIDEOS_DIR = path.join(MEDIA_DIR, "videos");
const VERSIONS_DIR = path.join(IMAGES_DIR, "versions");
const MASKS_DIR = path.join(MEDIA_DIR, "masks");

// Ensure directories exist
function ensureDirectories() {
  if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
  }
  if (!fs.existsSync(VIDEOS_DIR)) {
    fs.mkdirSync(VIDEOS_DIR, { recursive: true });
  }
}

ensureDirectories();

/**
 * Save an image from base64 data URL to disk
 * Returns the relative path for storage in database
 */
export function saveImage(shotId: string, base64DataUrl: string): string {
  ensureDirectories();

  // Extract base64 data from data URL
  const matches = base64DataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!matches) {
    throw new Error("Invalid image data URL format");
  }

  const ext = matches[1] === "jpeg" ? "jpg" : matches[1];
  const base64Data = matches[2];
  const buffer = Buffer.from(base64Data, "base64");

  const filename = `${shotId}.${ext}`;
  const filepath = path.join(IMAGES_DIR, filename);

  fs.writeFileSync(filepath, buffer);

  return `images/${filename}`;
}

/**
 * Save a video from base64 data URL to disk
 * Returns the relative path for storage in database
 */
export function saveVideo(shotId: string, base64DataUrl: string): string {
  ensureDirectories();

  // Extract base64 data from data URL
  // Handle various MIME types like video/mp4, video/webm, video/x-matroska, etc.
  const matches = base64DataUrl.match(/^data:video\/([^;]+);base64,(.+)$/);
  if (!matches) {
    throw new Error(`Invalid video data URL format. Received: ${base64DataUrl.substring(0, 100)}...`);
  }

  // Map MIME subtype to file extension
  const mimeSubtype = matches[1];
  const extMap: Record<string, string> = {
    "mp4": "mp4",
    "webm": "webm",
    "x-matroska": "mkv",
    "quicktime": "mov",
    "x-msvideo": "avi",
    "mpeg": "mpeg",
  };
  const ext = extMap[mimeSubtype] || "mp4";

  const base64Data = matches[2];
  const buffer = Buffer.from(base64Data, "base64");

  const filename = `${shotId}.${ext}`;
  const filepath = path.join(VIDEOS_DIR, filename);

  fs.writeFileSync(filepath, buffer);

  return `videos/${filename}`;
}

/**
 * Save a video from a Blob to disk
 * Returns the relative path for storage in database
 */
export async function saveVideoBlob(shotId: string, blob: Blob): Promise<string> {
  ensureDirectories();

  // Get the buffer from the blob
  const arrayBuffer = await blob.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Determine extension from MIME type
  const mimeType = blob.type || "video/mp4";
  const mimeSubtype = mimeType.split("/")[1] || "mp4";
  const extMap: Record<string, string> = {
    "mp4": "mp4",
    "webm": "webm",
    "x-matroska": "mkv",
    "quicktime": "mov",
    "x-msvideo": "avi",
    "mpeg": "mpeg",
  };
  const ext = extMap[mimeSubtype] || "mp4";

  const filename = `${shotId}.${ext}`;
  const filepath = path.join(VIDEOS_DIR, filename);

  fs.writeFileSync(filepath, buffer);

  return `videos/${filename}`;
}

/**
 * Get the full filesystem path for a media file
 */
export function getMediaPath(relativePath: string): string {
  return path.join(MEDIA_DIR, relativePath);
}

/**
 * Get the URL to serve a media file via the API
 * Includes a cache-busting timestamp to ensure fresh images after regeneration
 */
export function getMediaUrl(relativePath: string): string {
  return `/api/media/${relativePath}?t=${Date.now()}`;
}

/**
 * Delete a media file from disk
 */
export function deleteMedia(relativePath: string): boolean {
  try {
    const filepath = path.join(MEDIA_DIR, relativePath);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Check if a media file exists
 */
export function mediaExists(relativePath: string): boolean {
  const filepath = path.join(MEDIA_DIR, relativePath);
  return fs.existsSync(filepath);
}

/**
 * Read an image file and return as base64 data URL
 */
export function getImageAsBase64(relativePath: string): string | null {
  try {
    const filepath = path.join(MEDIA_DIR, relativePath);
    if (!fs.existsSync(filepath)) return null;

    const buffer = fs.readFileSync(filepath);
    const base64 = buffer.toString("base64");

    // Determine MIME type from extension
    const ext = path.extname(relativePath).toLowerCase().slice(1);
    const mimeMap: Record<string, string> = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
    };
    const mimeType = mimeMap[ext] || "image/png";

    return `data:${mimeType};base64,${base64}`;
  } catch {
    return null;
  }
}

/**
 * Ensure version directory exists for a shot
 */
function ensureVersionDir(shotId: string): string {
  const shotVersionDir = path.join(VERSIONS_DIR, shotId);
  if (!fs.existsSync(shotVersionDir)) {
    fs.mkdirSync(shotVersionDir, { recursive: true });
  }
  return shotVersionDir;
}

/**
 * Ensure mask directory exists for a shot
 */
function ensureMaskDir(shotId: string): string {
  const shotMaskDir = path.join(MASKS_DIR, shotId);
  if (!fs.existsSync(shotMaskDir)) {
    fs.mkdirSync(shotMaskDir, { recursive: true });
  }
  return shotMaskDir;
}

/**
 * Save a version image from base64 data URL to disk
 * Returns the relative path for storage in database
 */
export function saveVersionImage(
  shotId: string,
  versionNumber: number,
  base64DataUrl: string
): string {
  const shotVersionDir = ensureVersionDir(shotId);

  // Extract base64 data from data URL
  const matches = base64DataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!matches) {
    throw new Error("Invalid image data URL format");
  }

  const ext = matches[1] === "jpeg" ? "jpg" : matches[1];
  const base64Data = matches[2];
  const buffer = Buffer.from(base64Data, "base64");

  const filename = `v${versionNumber}.${ext}`;
  const filepath = path.join(shotVersionDir, filename);

  fs.writeFileSync(filepath, buffer);

  return `images/versions/${shotId}/${filename}`;
}

/**
 * Save a mask image from base64 data URL to disk
 * Returns the relative path for storage in database
 */
export function saveMaskImage(
  shotId: string,
  versionId: string,
  base64DataUrl: string
): string {
  const shotMaskDir = ensureMaskDir(shotId);

  // Extract base64 data from data URL
  const matches = base64DataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!matches) {
    throw new Error("Invalid mask image data URL format");
  }

  const base64Data = matches[2];
  const buffer = Buffer.from(base64Data, "base64");

  const filename = `${versionId}.png`;
  const filepath = path.join(shotMaskDir, filename);

  fs.writeFileSync(filepath, buffer);

  return `masks/${shotId}/${filename}`;
}

/**
 * Get a version image as base64 data URL
 */
export function getVersionImageAsBase64(
  shotId: string,
  versionNumber: number
): string | null {
  const shotVersionDir = path.join(VERSIONS_DIR, shotId);
  if (!fs.existsSync(shotVersionDir)) return null;

  // Find the version file (could be different extensions)
  const files = fs.readdirSync(shotVersionDir);
  const versionFile = files.find((f) => f.startsWith(`v${versionNumber}.`));
  if (!versionFile) return null;

  const filepath = path.join(shotVersionDir, versionFile);
  const buffer = fs.readFileSync(filepath);
  const base64 = buffer.toString("base64");

  const ext = path.extname(versionFile).toLowerCase().slice(1);
  const mimeMap: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
  };
  const mimeType = mimeMap[ext] || "image/png";

  return `data:${mimeType};base64,${base64}`;
}

/**
 * Delete all version images for a shot
 */
export function deleteVersionImages(shotId: string): boolean {
  try {
    const shotVersionDir = path.join(VERSIONS_DIR, shotId);
    if (fs.existsSync(shotVersionDir)) {
      fs.rmSync(shotVersionDir, { recursive: true });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Delete all mask images for a shot
 */
export function deleteMaskImages(shotId: string): boolean {
  try {
    const shotMaskDir = path.join(MASKS_DIR, shotId);
    if (fs.existsSync(shotMaskDir)) {
      fs.rmSync(shotMaskDir, { recursive: true });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
