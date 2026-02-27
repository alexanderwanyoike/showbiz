interface ThumbnailCacheEntry {
  frames: string[];
  timestamps: number[];
  generatedAt: number;
}

interface ThumbnailCache {
  [shotId: string]: ThumbnailCacheEntry;
}

class ThumbnailGenerator {
  private cache: ThumbnailCache = {};
  private frameCount = 8; // 1 frame per second for 8s video
  private thumbnailWidth = 80;
  private thumbnailHeight = 45; // 16:9 aspect ratio

  async generateThumbnails(
    videoUrl: string,
    shotId: string
  ): Promise<string[]> {
    // Check cache first
    if (this.cache[shotId]) {
      return this.cache[shotId].frames;
    }

    const video = document.createElement("video");
    video.src = videoUrl;
    video.muted = true;

    // Wait for video metadata to load
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Failed to load video"));
    });

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
      const time = (i / this.frameCount) * duration;
      video.currentTime = time;

      // Wait for seek to complete
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
      });

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

    // Cache results
    this.cache[shotId] = {
      frames,
      timestamps,
      generatedAt: Date.now(),
    };

    return frames;
  }

  getCachedThumbnails(shotId: string): string[] | null {
    return this.cache[shotId]?.frames || null;
  }

  clearCache(shotId?: string): void {
    if (shotId) {
      delete this.cache[shotId];
    } else {
      this.cache = {};
    }
  }
}

export const thumbnailGenerator = new ThumbnailGenerator();
