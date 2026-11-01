import { expect, it, vi } from "vitest";
import { openDatabase, loadMigrations } from "../db";
import path from "node:path";
import { createStoryboardPackageCommands } from "./storyboard-package";

it("returns cancellation without exporting and rejects unsupported formats before opening a dialog", async () => {
  const db = openDatabase(":memory:", loadMigrations(path.resolve("electron/migrations")));
  try {
    const save = vi.fn(async () => ({ canceled: true }));
    const commands = createStoryboardPackageCommands(db, "/unused", save);
    expect(await commands.export_storyboard_package({ storyboard_id: "sb", format: "sbz" })).toEqual({ ok: true, value: null });
    expect(save).toHaveBeenCalledWith({ defaultPath: "storyboard.sbz", filters: [{ name: "Showbiz storyboard", extensions: ["sbz"] }] });
    save.mockClear();
    expect(await commands.export_storyboard_package({ storyboard_id: "sb", format: "mp4" })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(save).not.toHaveBeenCalled();
  } finally { db.close(); }
});
