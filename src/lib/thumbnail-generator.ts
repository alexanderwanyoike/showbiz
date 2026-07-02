import {
  releaseVideoElement,
  waitForMediaEvent,
  fetchCompleteBlob,
  mediaOpenQueue,
  snapToKeyframeGrid,
} from "./media-pipeline";

// All transient probe pipelines (thumbnails, durations, frame extraction)
// share the app-wide open gate, leaving decode headroom for the actual
// playback elements (see media-pipeline.ts).
const probeQueue = mediaOpenQueue;

interface ThumbnailCacheEntry {
  frames: string[];
  timestamps: number[];
  generatedAt: number;
}

interface ThumbnailCache {
  [videoUrl: string]: ThumbnailCacheEntry;
}

class ThumbnailGenerator {
  private cache: ThumbnailCache = {};
  private frameCount = 8; // 1 frame per second for 8s video
  private thumbnailWidth = 80;
  private thumbnailHeight = 45; // 16:9 aspect ratio

  async generateThumbnails(videoUrl: string): Promise<string[]> {
    // Cache keyed by URL so different versions of a shot get their own frames
    if (this.cache[videoUrl]) {
      return this.cache[videoUrl].frames;
    }

    return probeQueue.run(async () => {
      // Re-check after waiting in the queue: a concurrent caller may have
      // populated the cache while this one was queued.
      if (this.cache[videoUrl]) {
        return this.cache[videoUrl].frames;
      }

      const { video, blobUrl } = await loadVideoElement(videoUrl);
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          throw new Error("Failed to get canvas context");
        }

        canvas.width = this.thumbnailWidth;
        canvas.height = this.thumbnailHeight;

        const frames: string[] = [];
        const timestamps: number[] = [];
        const duration = video.duration;

        for (let i = 0; i < this.frameCount; i++) {
          // Snap to the keyframe grid: keyframe decodes need no reference
          // buffers, so captured frames can't smear against recycled
          // decoder state. Bounded: a swallowed `seeked` must not wedge
          // the probe queue; on timeout we draw whatever frame is displayed
          const time = snapToKeyframeGrid((i / this.frameCount) * duration, 0, duration);
          const settled = waitForMediaEvent(video, "seeked", 1000);
          video.currentTime = time;
          await settled;

          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          try {
            frames.push(canvas.toDataURL("image/jpeg", 0.6));
          } catch {
            // Canvas may be tainted if asset:// CORS headers are unavailable;
            // push an empty string and the strip will show a blank frame.
            frames.push("");
          }
          timestamps.push(time);
        }

        this.cache[videoUrl] = {
          frames,
          timestamps,
          generatedAt: Date.now(),
        };

        return frames;
      } finally {
        releaseVideoElement(video);
        URL.revokeObjectURL(blobUrl);
      }
    });
  }

  async getVideoDuration(videoUrl: string): Promise<number> {
    return probeQueue.run(async () => {
      const { video, blobUrl } = await loadVideoElement(videoUrl);
      const duration = video.duration;
      releaseVideoElement(video);
      URL.revokeObjectURL(blobUrl);
      return Number.isFinite(duration) ? duration : 0;
    });
  }

  async extractFrame(videoUrl: string, time?: number): Promise<string> {
    return probeQueue.run(async () => {
      const { video, blobUrl } = await loadVideoElement(videoUrl);
      try {
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        const frameTime = time ?? Math.max(0, duration - 0.05);
        const settled = waitForMediaEvent(video, "seeked", 1000);
        video.currentTime = Math.max(0, Math.min(duration, frameTime));
        await settled;

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          throw new Error("Failed to get canvas context");
        }
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/jpeg", 0.9);
      } finally {
        releaseVideoElement(video);
        URL.revokeObjectURL(blobUrl);
      }
    });
  }

  getCachedThumbnails(videoUrl: string): string[] | null {
    return this.cache[videoUrl]?.frames || null;
  }

  clearCache(videoUrl?: string): void {
    if (videoUrl) {
      delete this.cache[videoUrl];
    } else {
      this.cache = {};
    }
  }
}

export const thumbnailGenerator = new ThumbnailGenerator();

async function loadVideoElement(videoUrl: string): Promise<{ video: HTMLVideoElement; blobUrl: string }> {
  const blob = await fetchCompleteBlob(videoUrl);
  const blobUrl = URL.createObjectURL(blob);

  // WebKitGTK media opens fail intermittently under pipeline pressure even
  // for valid files; a fresh element on a short delay usually succeeds.
  for (let attempt = 0; attempt < 2; attempt++) {
    const video = document.createElement("video");
    video.muted = true;

    const ready = waitForMediaEvent(video, "loadedmetadata", 5000);
    video.src = blobUrl;
    const outcome = await ready;
    if (outcome === "event") {
      return { video, blobUrl };
    }

    releaseVideoElement(video);
    console.warn(`[probe] metadata ${outcome} for ${videoUrl} (attempt ${attempt + 1})`);
    await new Promise((r) => setTimeout(r, 250));
  }

  URL.revokeObjectURL(blobUrl);
  throw new Error("Failed to load video after retries");
}
