import fs from "node:fs";
import path from "node:path";

/**
 * Ported media commands; names, argument keys and return shapes match
 * src-tauri/src/commands/media_cmd.rs. `mediaBaseDir` is the appDataDir/media
 * path (the Rust command derives it from the AppHandle).
 */
export function createMediaCommands(mediaBaseDir: string) {
  return {
    get_media_path(): string {
      return mediaBaseDir;
    },

    save_assembled_video(args?: Record<string, unknown>): void {
      const videoData = args?.videoData as number[];
      const savePath = args?.savePath as string;

      const parent = path.dirname(savePath);
      try {
        fs.mkdirSync(parent, { recursive: true });
      } catch (e) {
        throw new Error(
          `Failed to create directory: ${e instanceof Error ? e.message : String(e)}`
        );
      }
      try {
        fs.writeFileSync(savePath, Buffer.from(videoData));
      } catch (e) {
        throw new Error(
          `Failed to write assembled video: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    },
  };
}
