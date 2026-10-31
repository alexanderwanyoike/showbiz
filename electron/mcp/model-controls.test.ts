import { expect, it } from "vitest";
import path from "node:path";
import { openDatabase, loadMigrations } from "../db";
import { createDataCommands } from "../command-map";
import { createInvokeHandler } from "../ipc";
import { createMcpSession } from "./session";

it("discovers model metadata and prices and changes defaults and independent shot overrides through the live command boundary", async () => {
  const db = openDatabase(":memory:", loadMigrations(path.resolve("electron/migrations")));
  try {
    const commands = createDataCommands(db, "/unused");
    const project = commands.create_project({ name: "Model film" });
    const board = commands.create_storyboard({ projectId: project.id, name: "Opening" });
    const shot = commands.create_shot({ storyboardId: board.id });
    const session = createMcpSession(createInvokeHandler(commands));
    const models = await session.call({ tool: "get_generation_models", args: {} });
    expect(models).toMatchObject({ ok: true, value: { data: { ok: true, value: expect.arrayContaining([
      expect.objectContaining({ id: "local-video", kind: "video", provider: "local" }),
      expect.objectContaining({ id: "seedream-4.5-openrouter", kind: "image", provider: "openrouter" }),
    ]) } } });
    expect(JSON.stringify(models)).not.toContain("apiKey");
    expect(await session.call({ tool: "get_generation_price", args: { model_id: "nano-banana-2", kind: "image" } })).toMatchObject({ ok: true, value: { data: { ok: true, value: { provider: "gemini" } } } });
    expect(await session.call({ tool: "update_storyboard_models", args: { id: board.id, image_model: "seedream-4.5-openrouter", video_model: "veo-3.1-openrouter", expected_revision: 0, request_id: "defaults" } })).toMatchObject({ ok: true, value: { revision: 1 } });
    const override = { tool: "set_shot_models", args: { shot_id: shot.id, video_model: "local-video", expected_revision: 1, request_id: "override" } };
    expect(await session.call(override)).toMatchObject({ ok: true, value: { revision: 2 } });
    expect(await session.call(override)).toMatchObject({ ok: true, value: { revision: 2 } });
    expect(commands.get_shots({ storyboardId: board.id }).find((item) => item.id === shot.id)).toMatchObject({ image_model: null, video_model: "local-video" });
    expect(await session.call({ tool: "set_shot_models", args: { shot_id: shot.id, video_model: null, expected_revision: 2, request_id: "inherit" } })).toMatchObject({ ok: true });
    expect(commands.get_shots({ storyboardId: board.id }).find((item) => item.id === shot.id)).toMatchObject({ video_model: null });
    expect(commands.get_storyboard({ id: board.id })).toMatchObject({ image_model: "seedream-4.5-openrouter", video_model: "veo-3.1-openrouter" });
    expect(await session.call({ tool: "save_generation_price", args: {} })).toMatchObject({ ok: false });
  } finally { db.close(); }
});
