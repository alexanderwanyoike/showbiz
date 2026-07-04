import fs from "node:fs";
import path from "node:path";

/**
 * Media file I/O ported from the retired Rust backend's media.rs. Where the Rust functions
 * took an AppHandle to locate the app data dir, these take an explicit media
 * base directory string (the appDataDir/media path) so they stay pure and
 * testable. Shared dependency for the ported shots, bibles, image_versions and
 * video_versions command modules.
 */

/** Resolve the media base directory (appDataDir/media), mirroring Rust get_media_base_dir. */
export function mediaBaseDir(appDataDir: string): string {
  return path.join(appDataDir, "media");
}

/** Create the media subdirectories, mirroring Rust media::init. */
export function initMediaDirs(baseDir: string): void {
  fs.mkdirSync(path.join(baseDir, "images", "versions"), { recursive: true });
  fs.mkdirSync(path.join(baseDir, "videos"), { recursive: true });
  fs.mkdirSync(path.join(baseDir, "videos", "versions"), { recursive: true });
  fs.mkdirSync(path.join(baseDir, "masks"), { recursive: true });
}

/**
 * Strict base64 decode. Node's Buffer.from(str, "base64") is lenient and
 * silently drops invalid characters; Rust's base64 STANDARD engine rejects
 * them. We reject non-alphabet input so behaviour matches the Rust port.
 */
function decodeBase64Strict(input: string): Buffer {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(input) || input.length % 4 !== 0) {
    throw new Error("Base64 decode error: invalid base64 string");
  }
  return Buffer.from(input, "base64");
}

/**
 * Parse a base64 data URL into its MIME subtype and raw bytes.
 * Supports formats like "data:image/png;base64,iVBOR..." and
 * "data:video/mp4;base64,AAAA...".
 */
export function parseDataUrl(dataUrl: string): { mimeSubtype: string; bytes: Buffer } {
  const commaPos = dataUrl.indexOf(",");
  if (commaPos === -1) {
    throw new Error("Invalid data URL: no comma separator found");
  }

  const header = dataUrl.slice(0, commaPos);
  const b64Data = dataUrl.slice(commaPos + 1);

  const slashPos = header.indexOf("/");
  if (slashPos === -1) {
    throw new Error("Invalid data URL: no MIME type found");
  }
  const afterSlash = header.slice(slashPos + 1);
  const semicolonPos = afterSlash.indexOf(";");
  const mimeSubtype =
    semicolonPos === -1 ? afterSlash : afterSlash.slice(0, semicolonPos);

  const bytes = decodeBase64Strict(b64Data);
  return { mimeSubtype, bytes };
}

/** Map an image MIME subtype to a file extension. */
export function imageExt(mimeSubtype: string): string {
  switch (mimeSubtype) {
    case "jpeg":
      return "jpg";
    case "png":
      return "png";
    case "gif":
      return "gif";
    case "webp":
      return "webp";
    default:
      return "png";
  }
}

/** Map a video MIME subtype to a file extension. */
export function videoExt(mimeSubtype: string): string {
  switch (mimeSubtype) {
    case "mp4":
      return "mp4";
    case "webm":
      return "webm";
    case "x-matroska":
      return "mkv";
    case "quicktime":
      return "mov";
    case "x-msvideo":
      return "avi";
    case "mpeg":
      return "mpeg";
    default:
      return "mp4";
  }
}

/** Map a file extension to a MIME type. */
export function extToMime(ext: string): string {
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "mp4":
      return "video/mp4";
    case "webm":
      return "video/webm";
    case "mkv":
      return "video/x-matroska";
    case "mov":
      return "video/quicktime";
    case "avi":
      return "video/x-msvideo";
    case "mpeg":
      return "video/mpeg";
    default:
      return "application/octet-stream";
  }
}

/** Map a video MIME type string (full or bare subtype) to a file extension. */
export function videoMimeToExt(mimeType: string): string {
  const slashPos = mimeType.indexOf("/");
  const subtype = slashPos === -1 ? mimeType : mimeType.slice(slashPos + 1);
  return videoExt(subtype);
}

/** Relative path for a bible variant image. */
export function bibleImageRelativePath(
  bibleId: string,
  variantId: string,
  ext: string
): string {
  return `bible/${bibleId}/${variantId}.${ext}`;
}

/** Save an image from a base64 data URL. Returns a relative path like "images/shotid.ext". */
export function saveImage(baseDir: string, shotId: string, base64DataUrl: string): string {
  const { mimeSubtype, bytes } = parseDataUrl(base64DataUrl);
  const filename = `${shotId}.${imageExt(mimeSubtype)}`;
  writeFileMapErr(path.join(baseDir, "images", filename), bytes, "Failed to write image");
  return `images/${filename}`;
}

/** Save a shot's end frame. Returns a relative path like "images/shotid_end.ext". */
export function saveEndFrame(baseDir: string, shotId: string, base64DataUrl: string): string {
  const { mimeSubtype, bytes } = parseDataUrl(base64DataUrl);
  const filename = `${shotId}_end.${imageExt(mimeSubtype)}`;
  writeFileMapErr(path.join(baseDir, "images", filename), bytes, "Failed to write end frame");
  return `images/${filename}`;
}

/** Save a video from a base64 data URL. Returns a relative path like "videos/shotid.ext". */
export function saveVideo(baseDir: string, shotId: string, base64DataUrl: string): string {
  const { mimeSubtype, bytes } = parseDataUrl(base64DataUrl);
  const filename = `${shotId}.${videoExt(mimeSubtype)}`;
  writeFileMapErr(path.join(baseDir, "videos", filename), bytes, "Failed to write video");
  return `videos/${filename}`;
}

/** Save raw video bytes with a given MIME type. Returns a relative path. */
export function saveVideoBlob(
  baseDir: string,
  shotId: string,
  data: Uint8Array,
  mimeType: string
): string {
  const filename = `${shotId}.${videoMimeToExt(mimeType)}`;
  writeFileMapErr(path.join(baseDir, "videos", filename), data, "Failed to write video blob");
  return `videos/${filename}`;
}

/**
 * Read a media file and return it as a base64 data URL
 * (e.g. "data:image/png;base64,..."). Returns null if the file does not exist.
 */
export function getImageAsBase64(baseDir: string, relativePath: string): string | null {
  const filepath = path.join(baseDir, relativePath);
  if (!fs.existsSync(filepath)) {
    return null;
  }
  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(filepath);
  } catch (e) {
    throw new Error(`Failed to read file: ${errMessage(e)}`);
  }
  const ext = path.extname(filepath).replace(/^\./, "") || "png";
  const mime = extToMime(ext);
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

/** Delete a media file given its relative path. Returns true if deleted. */
export function deleteMedia(baseDir: string, relativePath: string): boolean {
  const filepath = path.join(baseDir, relativePath);
  if (!fs.existsSync(filepath)) {
    return false;
  }
  try {
    fs.rmSync(filepath);
    return true;
  } catch {
    return false;
  }
}

/** Save a version image. Returns a relative path like "images/versions/shotid/vN.ext". */
export function saveVersionImage(
  baseDir: string,
  shotId: string,
  versionNumber: number,
  base64DataUrl: string
): string {
  const versionDir = path.join(baseDir, "images", "versions", shotId);
  mkdirMapErr(versionDir, "Failed to create version dir");
  const { mimeSubtype, bytes } = parseDataUrl(base64DataUrl);
  const filename = `v${versionNumber}.${imageExt(mimeSubtype)}`;
  writeFileMapErr(path.join(versionDir, filename), bytes, "Failed to write version image");
  return `images/versions/${shotId}/${filename}`;
}

/** Delete all version images for a shot. Returns true if the directory existed. */
export function deleteVersionImages(baseDir: string, shotId: string): boolean {
  return removeDirIfExists(path.join(baseDir, "images", "versions", shotId));
}

/** Delete all mask images for a shot. Returns true if the directory existed. */
export function deleteMaskImages(baseDir: string, shotId: string): boolean {
  return removeDirIfExists(path.join(baseDir, "masks", shotId));
}

/** Save a bible variant image from a base64 data URL. Returns a relative path. */
export function saveBibleImage(
  baseDir: string,
  bibleId: string,
  variantId: string,
  base64DataUrl: string
): string {
  const { mimeSubtype, bytes } = parseDataUrl(base64DataUrl);
  const relativePath = bibleImageRelativePath(bibleId, variantId, imageExt(mimeSubtype));
  const filepath = path.join(baseDir, relativePath);
  mkdirMapErr(path.dirname(filepath), "Failed to create bible media dir");
  writeFileMapErr(filepath, bytes, "Failed to write bible image");
  return relativePath;
}

/** Delete all media for a bible. Returns true if the directory existed. */
export function deleteBibleMedia(baseDir: string, bibleId: string): boolean {
  return removeDirIfExists(path.join(baseDir, "bible", bibleId));
}

/** Save a version video from raw bytes. Returns a relative path like "videos/versions/shotid/vN.ext". */
export function saveVersionVideo(
  baseDir: string,
  shotId: string,
  versionNumber: number,
  data: Uint8Array,
  mimeType: string
): string {
  const versionDir = path.join(baseDir, "videos", "versions", shotId);
  mkdirMapErr(versionDir, "Failed to create video version dir");
  const filename = `v${versionNumber}.${videoMimeToExt(mimeType)}`;
  writeFileMapErr(path.join(versionDir, filename), data, "Failed to write version video");
  return `videos/versions/${shotId}/${filename}`;
}

// -- internal helpers --

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function writeFileMapErr(filepath: string, data: Uint8Array, context: string): void {
  try {
    fs.writeFileSync(filepath, data);
  } catch (e) {
    throw new Error(`${context}: ${errMessage(e)}`);
  }
}

function mkdirMapErr(dir: string, context: string): void {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    throw new Error(`${context}: ${errMessage(e)}`);
  }
}

function removeDirIfExists(dir: string): boolean {
  if (!fs.existsSync(dir)) {
    return false;
  }
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}
