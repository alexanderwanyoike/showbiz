import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  parseDataUrl,
  imageExt,
  videoExt,
  extToMime,
  videoMimeToExt,
  bibleImageRelativePath,
  mediaBaseDir,
  initMediaDirs,
  saveImage,
  saveEndFrame,
  saveVideo,
  saveVideoBlob,
  getImageAsBase64,
  deleteMedia,
  saveVersionImage,
  deleteVersionImages,
  deleteMaskImages,
  saveBibleImage,
  deleteBibleMedia,
  saveVersionVideo,
} from "./media-files";

// -- parse_data_url tests (mirror src-tauri/src/media.rs) --

describe("parseDataUrl", () => {
  it("parses a valid png data URL", () => {
    const b64 = Buffer.from("fake png bytes").toString("base64");
    const { mimeSubtype, bytes } = parseDataUrl(`data:image/png;base64,${b64}`);
    expect(mimeSubtype).toBe("png");
    expect(bytes.equals(Buffer.from("fake png bytes"))).toBe(true);
  });

  it("parses a valid jpeg data URL", () => {
    const b64 = Buffer.from("jpeg data").toString("base64");
    const { mimeSubtype } = parseDataUrl(`data:image/jpeg;base64,${b64}`);
    expect(mimeSubtype).toBe("jpeg");
  });

  it("parses a valid mp4 video data URL", () => {
    const b64 = Buffer.from("mp4 data").toString("base64");
    const { mimeSubtype, bytes } = parseDataUrl(`data:video/mp4;base64,${b64}`);
    expect(mimeSubtype).toBe("mp4");
    expect(bytes.equals(Buffer.from("mp4 data"))).toBe(true);
  });

  it("throws when the comma separator is missing", () => {
    expect(() => parseDataUrl("data:image/png;base64AAAA")).toThrow(
      /no comma separator/
    );
  });

  it("throws when the MIME type is missing", () => {
    expect(() => parseDataUrl("database64,AAAA")).toThrow(/no MIME type/);
  });

  it("throws on invalid base64", () => {
    expect(() =>
      parseDataUrl("data:image/png;base64,!!!not-valid-base64!!!")
    ).toThrow(/Base64 decode error/);
  });
});

// -- image_ext tests --

describe("imageExt", () => {
  it("maps known image subtypes", () => {
    expect(imageExt("jpeg")).toBe("jpg");
    expect(imageExt("png")).toBe("png");
    expect(imageExt("gif")).toBe("gif");
    expect(imageExt("webp")).toBe("webp");
  });

  it("defaults unknown subtypes to png", () => {
    expect(imageExt("bmp")).toBe("png");
    expect(imageExt("tiff")).toBe("png");
  });
});

// -- video_ext tests --

describe("videoExt", () => {
  it("maps known video subtypes", () => {
    expect(videoExt("mp4")).toBe("mp4");
    expect(videoExt("webm")).toBe("webm");
    expect(videoExt("x-matroska")).toBe("mkv");
    expect(videoExt("quicktime")).toBe("mov");
    expect(videoExt("x-msvideo")).toBe("avi");
    expect(videoExt("mpeg")).toBe("mpeg");
  });

  it("defaults unknown subtypes to mp4", () => {
    expect(videoExt("flv")).toBe("mp4");
    expect(videoExt("unknown")).toBe("mp4");
  });
});

// -- ext_to_mime tests --

describe("extToMime", () => {
  it("maps extensions to MIME types", () => {
    expect(extToMime("png")).toBe("image/png");
    expect(extToMime("jpg")).toBe("image/jpeg");
    expect(extToMime("jpeg")).toBe("image/jpeg");
    expect(extToMime("gif")).toBe("image/gif");
    expect(extToMime("webp")).toBe("image/webp");
    expect(extToMime("mp4")).toBe("video/mp4");
    expect(extToMime("webm")).toBe("video/webm");
    expect(extToMime("mkv")).toBe("video/x-matroska");
    expect(extToMime("mov")).toBe("video/quicktime");
    expect(extToMime("avi")).toBe("video/x-msvideo");
    expect(extToMime("mpeg")).toBe("video/mpeg");
    expect(extToMime("unknown")).toBe("application/octet-stream");
  });
});

// -- video_mime_to_ext tests --

describe("videoMimeToExt", () => {
  it("handles a full MIME type", () => {
    expect(videoMimeToExt("video/mp4")).toBe("mp4");
    expect(videoMimeToExt("video/webm")).toBe("webm");
  });

  it("handles a bare subtype", () => {
    expect(videoMimeToExt("mp4")).toBe("mp4");
    expect(videoMimeToExt("webm")).toBe("webm");
  });
});

// -- bible_image_relative_path tests --

describe("bibleImageRelativePath", () => {
  it("is stable", () => {
    expect(bibleImageRelativePath("bible-1", "variant-1", "png")).toBe(
      "bible/bible-1/variant-1.png"
    );
  });
});

// -- media base dir resolution --

describe("mediaBaseDir", () => {
  it("appends media to the app data dir", () => {
    expect(mediaBaseDir("/data/com.showbiz.app")).toBe(
      path.join("/data/com.showbiz.app", "media")
    );
  });
});

// -- file I/O tests --

describe("media file I/O", () => {
  let base: string;

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), "showbiz-media-"));
  });

  afterEach(() => {
    fs.rmSync(base, { recursive: true, force: true });
  });

  const pngUrl = `data:image/png;base64,${Buffer.from("png-bytes").toString("base64")}`;
  const jpegUrl = `data:image/jpeg;base64,${Buffer.from("jpg-bytes").toString("base64")}`;
  const mp4Url = `data:video/mp4;base64,${Buffer.from("mp4-bytes").toString("base64")}`;

  it("initMediaDirs creates the media subdirectories", () => {
    initMediaDirs(base);
    expect(fs.existsSync(path.join(base, "images", "versions"))).toBe(true);
    expect(fs.existsSync(path.join(base, "videos"))).toBe(true);
    expect(fs.existsSync(path.join(base, "videos", "versions"))).toBe(true);
    expect(fs.existsSync(path.join(base, "masks"))).toBe(true);
  });

  it("saveImage writes the file and returns a relative path", () => {
    initMediaDirs(base);
    const rel = saveImage(base, "shot-1", pngUrl);
    expect(rel).toBe("images/shot-1.png");
    expect(fs.readFileSync(path.join(base, rel)).toString()).toBe("png-bytes");
  });

  it("saveImage uses jpg extension for jpeg data URLs", () => {
    initMediaDirs(base);
    const rel = saveImage(base, "shot-2", jpegUrl);
    expect(rel).toBe("images/shot-2.jpg");
  });

  it("saveEndFrame writes an _end suffixed file", () => {
    initMediaDirs(base);
    const rel = saveEndFrame(base, "shot-1", pngUrl);
    expect(rel).toBe("images/shot-1_end.png");
    expect(fs.existsSync(path.join(base, rel))).toBe(true);
  });

  it("saveVideo writes the video and returns a relative path", () => {
    initMediaDirs(base);
    const rel = saveVideo(base, "shot-1", mp4Url);
    expect(rel).toBe("videos/shot-1.mp4");
    expect(fs.readFileSync(path.join(base, rel)).toString()).toBe("mp4-bytes");
  });

  it("saveVideoBlob writes raw bytes with the mime-derived extension", () => {
    initMediaDirs(base);
    const rel = saveVideoBlob(base, "shot-1", Buffer.from("blob"), "video/webm");
    expect(rel).toBe("videos/shot-1.webm");
    expect(fs.readFileSync(path.join(base, rel)).toString()).toBe("blob");
  });

  it("getImageAsBase64 returns a data URL for an existing file", () => {
    initMediaDirs(base);
    const rel = saveImage(base, "shot-1", pngUrl);
    const dataUrl = getImageAsBase64(base, rel);
    expect(dataUrl).toBe(
      `data:image/png;base64,${Buffer.from("png-bytes").toString("base64")}`
    );
  });

  it("getImageAsBase64 returns null when the file is missing", () => {
    expect(getImageAsBase64(base, "images/missing.png")).toBeNull();
  });

  it("deleteMedia removes an existing file and reports true", () => {
    initMediaDirs(base);
    const rel = saveImage(base, "shot-1", pngUrl);
    expect(deleteMedia(base, rel)).toBe(true);
    expect(fs.existsSync(path.join(base, rel))).toBe(false);
  });

  it("deleteMedia reports false for a missing file", () => {
    expect(deleteMedia(base, "images/missing.png")).toBe(false);
  });

  it("saveVersionImage writes into a per-shot version directory", () => {
    const rel = saveVersionImage(base, "shot-1", 3, pngUrl);
    expect(rel).toBe("images/versions/shot-1/v3.png");
    expect(fs.existsSync(path.join(base, rel))).toBe(true);
  });

  it("deleteVersionImages removes the version directory", () => {
    saveVersionImage(base, "shot-1", 1, pngUrl);
    expect(deleteVersionImages(base, "shot-1")).toBe(true);
    expect(fs.existsSync(path.join(base, "images", "versions", "shot-1"))).toBe(
      false
    );
  });

  it("deleteVersionImages reports false when nothing to delete", () => {
    expect(deleteVersionImages(base, "shot-x")).toBe(false);
  });

  it("deleteMaskImages removes the mask directory", () => {
    fs.mkdirSync(path.join(base, "masks", "shot-1"), { recursive: true });
    fs.writeFileSync(path.join(base, "masks", "shot-1", "v1.png"), "m");
    expect(deleteMaskImages(base, "shot-1")).toBe(true);
    expect(fs.existsSync(path.join(base, "masks", "shot-1"))).toBe(false);
  });

  it("deleteMaskImages reports false when nothing to delete", () => {
    expect(deleteMaskImages(base, "shot-x")).toBe(false);
  });

  it("saveBibleImage writes into the bible directory and returns a relative path", () => {
    const rel = saveBibleImage(base, "bible-1", "variant-1", pngUrl);
    expect(rel).toBe("bible/bible-1/variant-1.png");
    expect(fs.readFileSync(path.join(base, rel)).toString()).toBe("png-bytes");
  });

  it("deleteBibleMedia removes the bible directory", () => {
    saveBibleImage(base, "bible-1", "variant-1", pngUrl);
    expect(deleteBibleMedia(base, "bible-1")).toBe(true);
    expect(fs.existsSync(path.join(base, "bible", "bible-1"))).toBe(false);
  });

  it("deleteBibleMedia reports false when nothing to delete", () => {
    expect(deleteBibleMedia(base, "bible-x")).toBe(false);
  });

  it("saveVersionVideo writes into a per-shot video version directory", () => {
    const rel = saveVersionVideo(base, "shot-1", 2, Buffer.from("vid"), "video/mp4");
    expect(rel).toBe("videos/versions/shot-1/v2.mp4");
    expect(fs.readFileSync(path.join(base, rel)).toString()).toBe("vid");
  });
});
