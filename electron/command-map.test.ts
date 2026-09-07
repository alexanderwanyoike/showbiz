import { DatabaseSync } from "node:sqlite";
import { expect, it, vi } from "vitest";
import { createDataCommands } from "./command-map";
import { createExportCommands } from "./commands/export";
import { createWorkRuntime } from "./work-runtime";

it("guards every registered mutation while leaving reads and dialogs idle", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    const exportCommands = createExportCommands(db, "/unused-media", {
      spawn: () => { throw new Error("Command coverage must not execute ffmpeg"); },
      ffmpegPath: "/unused-ffmpeg", showSaveDialog: async () => ({ canceled: true }), onProgress: vi.fn(),
    });
    const commands = createDataCommands(db, "/unused-media", exportCommands);
    const runtime = createWorkRuntime({ windows: () => [], confirm: vi.fn(), quit: vi.fn() });
    for (const command of Object.keys(commands)) {
      let finish!: () => void;
      const operation = runtime.invoke(1, command, {}, () => new Promise<void>((resolve) => { finish = resolve; }));
      try {
        const readOnly = command.startsWith("get_") || ["http_request", "show_export_save_dialog"].includes(command);
        const expected = readOnly ? [] : [command === "export_timeline_video" ? "export" : "saving"];
        expect(runtime.work.getStatus().active, `Work classification for ${command}`).toEqual(expected);
      } finally {
        finish();
        await operation;
      }
    }
  } finally { db.close(); }
});
