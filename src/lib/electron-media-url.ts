import { invoke } from "./bridge";

type ReadMediaBytes = (relativePath: string) => Promise<Uint8Array>;

interface ElectronMediaUrlResolverDeps {
  getMediaBasePath: () => Promise<string>;
  readMediaBytes: ReadMediaBytes;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
}

interface CacheEntry {
  promise: Promise<string>;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

function relativeMediaPath(absPath: string, mediaBasePath: string): string {
  const normalizedPath = normalizePath(absPath);
  const normalizedBase = normalizePath(mediaBasePath);
  const prefix = `${normalizedBase}/`;

  if (!normalizedPath.startsWith(prefix)) {
    throw new Error(`Media path is outside the media directory: ${absPath}`);
  }

  return normalizedPath.slice(prefix.length);
}

function mediaMimeType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "mp4":
    case "m4v":
      return "video/mp4";
    case "webm":
      return "video/webm";
    case "mov":
      return "video/quicktime";
    default:
      return "application/octet-stream";
  }
}

function bytesToBlob(bytes: Uint8Array, type: string): Blob {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Blob([buffer], { type });
}

export function createElectronMediaUrlResolver({
  getMediaBasePath,
  readMediaBytes,
  createObjectURL = (blob) => URL.createObjectURL(blob),
  revokeObjectURL = (url) => URL.revokeObjectURL(url),
}: ElectronMediaUrlResolverDeps) {
  let mediaBasePathPromise: Promise<string> | null = null;
  const cache = new Map<string, CacheEntry>();

  async function getBasePath(): Promise<string> {
    mediaBasePathPromise ??= getMediaBasePath();
    return mediaBasePathPromise;
  }

  return {
    resolve(absPath: string): Promise<string> {
      const cached = cache.get(absPath);
      if (cached) return cached.promise;

      const promise = getBasePath()
        .then((basePath) => relativeMediaPath(absPath, basePath))
        .then(async (relativePath) => {
          const bytes = await readMediaBytes(relativePath);
          return createObjectURL(bytesToBlob(bytes, mediaMimeType(relativePath)));
        });

      promise.catch(() => cache.delete(absPath));
      cache.set(absPath, { promise });
      return promise;
    },

    invalidate(absPath: string): void {
      const cached = cache.get(absPath);
      if (!cached) return;
      cache.delete(absPath);
      cached.promise.then(revokeObjectURL).catch(() => {});
    },

    invalidateAll(): void {
      const entries = [...cache.values()];
      cache.clear();
      for (const entry of entries) {
        entry.promise.then(revokeObjectURL).catch(() => {});
      }
    },
  };
}

export type ElectronMediaUrlResolver = ReturnType<typeof createElectronMediaUrlResolver>;

export const electronMediaUrlResolver = createElectronMediaUrlResolver({
  getMediaBasePath: () => invoke<string>("get_media_path"),
  readMediaBytes: (relativePath) => {
    if (!window.showbiz) {
      return Promise.reject(new Error("Electron media bridge is unavailable"));
    }
    return window.showbiz.readMediaBytes(relativePath);
  },
});
