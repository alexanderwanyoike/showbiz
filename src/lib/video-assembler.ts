import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

export class VideoAssembler {
  private ffmpeg: FFmpeg | null = null;
  private isLoaded = false;

  async load() {
    if (this.isLoaded) return;

    this.ffmpeg = new FFmpeg();

    // Load ffmpeg.wasm files from CDN
    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.4/dist/umd";

    try {
      await this.ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
      });
      this.isLoaded = true;
      console.log("FFmpeg loaded successfully");
    } catch (error) {
      console.error("Failed to load FFmpeg:", error);
      throw error;
    }
  }

  async assembleVideos(videoSources: string[]): Promise<Uint8Array> {
    if (!this.ffmpeg || !this.isLoaded) {
      await this.load();
    }

    if (!this.ffmpeg) throw new Error("FFmpeg not initialized");

    const ffmpeg = this.ffmpeg;
    const inputFiles: string[] = [];

    console.log("Starting assembly of", videoSources.length, "videos...");

    // 1. Write video files to FFmpeg memory filesystem
    for (let i = 0; i < videoSources.length; i++) {
      const source = videoSources[i];
      const filename = `input${i}.mp4`;

      try {
        const fileData = await this.sourceToUint8Array(source);
        await ffmpeg.writeFile(filename, fileData);
        inputFiles.push(filename);
        console.log(`Wrote ${filename} (${fileData.byteLength} bytes)`);
      } catch (e) {
        console.error(`Error processing video ${i}:`, e);
        throw new Error(`Failed to load video segment ${i + 1}`);
      }
    }

    // 2. Create concat list file
    const fileListContent = inputFiles.map((f) => `file '${f}'`).join("\n");
    await ffmpeg.writeFile("list.txt", new TextEncoder().encode(fileListContent));

    // 3. Run concat with re-encoding for compatibility
    // Re-encoding ensures all videos have same codec/format even if sources differ
    console.log("Running ffmpeg concat with re-encoding...");

    try {
      await ffmpeg.exec([
        "-f", "concat",
        "-safe", "0",
        "-i", "list.txt",
        // Re-encode video to H.264 for compatibility
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        // Re-encode audio to AAC
        "-c:a", "aac",
        "-b:a", "128k",
        // Output format
        "-movflags", "+faststart",
        "-y",
        "output.mp4",
      ]);
    } catch (execError) {
      console.error("FFmpeg execution error:", execError);
      throw new Error("Failed to concatenate videos");
    }

    // 4. Read output file
    let outputData: Uint8Array;
    try {
      const fileData = await ffmpeg.readFile("output.mp4");
      if (typeof fileData === "string") {
        outputData = new TextEncoder().encode(fileData);
      } else {
        outputData = fileData;
      }
    } catch (readError) {
      console.error("Failed to read output:", readError);
      throw new Error("Failed to read assembled video");
    }

    if (outputData.byteLength === 0) {
      throw new Error("Output video is empty - concatenation may have failed");
    }

    console.log("Assembly complete:", `${outputData.byteLength} bytes`);

    // 5. Cleanup all files from memory
    await this.cleanup(ffmpeg, [...inputFiles, "list.txt", "output.mp4"]);

    return outputData;
  }

  /**
   * Convert various video sources to Uint8Array
   * Handles: base64 data URLs, blob URLs, and HTTP URLs
   */
  private async sourceToUint8Array(source: string): Promise<Uint8Array> {
    // Handle base64 data URLs (data:video/mp4;base64,...)
    if (source.startsWith("data:")) {
      const base64Match = source.match(/^data:[^;]+;base64,(.+)$/);
      if (base64Match) {
        const base64 = base64Match[1];
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
      }
      throw new Error("Invalid data URL format");
    }

    // Handle blob URLs and HTTP URLs
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`Failed to fetch video: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  /**
   * Clean up files from FFmpeg memory filesystem
   */
  private async cleanup(ffmpeg: FFmpeg, files: string[]): Promise<void> {
    for (const file of files) {
      try {
        await ffmpeg.deleteFile(file);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Assemble videos with trim points applied
   * Each clip specifies its source video and trim in/out points
   */
  async assembleTrimmedVideos(
    clips: { videoUrl: string; trimIn: number; trimOut: number }[]
  ): Promise<Uint8Array> {
    if (!this.ffmpeg || !this.isLoaded) {
      await this.load();
    }

    if (!this.ffmpeg) throw new Error("FFmpeg not initialized");

    const ffmpeg = this.ffmpeg;
    const trimmedFiles: string[] = [];

    console.log("Starting trimmed assembly of", clips.length, "clips...");

    // 1. For each clip, create a trimmed version
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const inputFilename = `input${i}.mp4`;
      const outputFilename = `trimmed${i}.mp4`;

      try {
        // Write source video to memory
        const fileData = await this.sourceToUint8Array(clip.videoUrl);
        await ffmpeg.writeFile(inputFilename, fileData);

        // Trim the video using -ss (start) and -t (duration)
        const duration = clip.trimOut - clip.trimIn;
        await ffmpeg.exec([
          "-ss",
          clip.trimIn.toFixed(3),
          "-i",
          inputFilename,
          "-t",
          duration.toFixed(3),
          "-c",
          "copy", // Stream copy for speed (no re-encode for trim)
          "-y",
          outputFilename,
        ]);

        trimmedFiles.push(outputFilename);
        console.log(
          `Trimmed ${outputFilename}: ${clip.trimIn.toFixed(2)}s - ${clip.trimOut.toFixed(2)}s (${duration.toFixed(2)}s)`
        );

        // Clean up input file to save memory
        await ffmpeg.deleteFile(inputFilename);
      } catch (e) {
        console.error(`Error trimming video ${i}:`, e);
        throw new Error(`Failed to trim video segment ${i + 1}`);
      }
    }

    // 2. Concatenate all trimmed clips
    const fileListContent = trimmedFiles.map((f) => `file '${f}'`).join("\n");
    await ffmpeg.writeFile("list.txt", new TextEncoder().encode(fileListContent));

    // 3. Run concat with re-encoding for seamless joins
    console.log("Running ffmpeg concat with re-encoding...");

    try {
      await ffmpeg.exec([
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        "list.txt",
        // Re-encode video to H.264 for compatibility
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "23",
        // Re-encode audio to AAC
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        // Output format
        "-movflags",
        "+faststart",
        "-y",
        "output.mp4",
      ]);
    } catch (execError) {
      console.error("FFmpeg concat error:", execError);
      throw new Error("Failed to concatenate trimmed videos");
    }

    // 4. Read output file
    let outputData: Uint8Array;
    try {
      const fileData = await ffmpeg.readFile("output.mp4");
      if (typeof fileData === "string") {
        outputData = new TextEncoder().encode(fileData);
      } else {
        outputData = fileData;
      }
    } catch (readError) {
      console.error("Failed to read output:", readError);
      throw new Error("Failed to read assembled video");
    }

    if (outputData.byteLength === 0) {
      throw new Error("Output video is empty - concatenation may have failed");
    }

    console.log("Trimmed assembly complete:", `${outputData.byteLength} bytes`);

    // 5. Cleanup all files from memory
    await this.cleanup(ffmpeg, [...trimmedFiles, "list.txt", "output.mp4"]);

    return outputData;
  }
}

// Singleton instance
export const videoAssembler = new VideoAssembler();
