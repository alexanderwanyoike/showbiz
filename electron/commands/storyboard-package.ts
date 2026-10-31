import type { DatabaseSync } from "node:sqlite";
import type { Result } from "../../shared/result";
import type { StoryboardPackageExport } from "../../shared/storyboard-package";
import { exportStoryboardPackage } from "../storyboard-package";

type SaveDialog = (options: { defaultPath: string; filters: { name: string; extensions: string[] }[] }) => Promise<{ canceled: boolean; filePath?: string }>;

export function createStoryboardPackageCommands(db: DatabaseSync, mediaDir: string, save: SaveDialog) {
  return {
    async export_storyboard_package(args?: Record<string, unknown>): Promise<Result<StoryboardPackageExport | null>> {
      if (typeof args?.storyboard_id !== "string" || (args.format !== "zip" && args.format !== "sbz")) {
        return { ok: false, error: { code: "INVALID_INPUT", message: "Choose a storyboard and ZIP or SBZ format" } };
      }
      try {
        const selection = await save({ defaultPath: `storyboard.${args.format}`, filters: [{ name: args.format === "sbz" ? "Showbiz storyboard" : "Storyboard media", extensions: [args.format] }] });
        if (selection.canceled || !selection.filePath) return { ok: true, value: null };
        return exportStoryboardPackage(db, mediaDir, args.storyboard_id, selection.filePath);
      } catch (cause) {
        return { ok: false, error: { code: "IO_ERROR", message: cause instanceof Error ? cause.message : String(cause) } };
      }
    },
  };
}
