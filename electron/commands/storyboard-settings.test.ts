import { expect, it } from "vitest";
import { openTestDb } from "../db.test";
import { createDataCommands } from "../command-map";
import { createInvokeHandler } from "../ipc";
it("saves a storyboard name and both model defaults together and preserves them on invalid input", async () => {
  const db = openTestDb();
  try {
    const commands = createDataCommands(db, "/unused");
    const project = commands.create_project({ name: "Film" });
    const board = commands.create_storyboard({
      projectId: project.id,
      name: "Opening",
    });
    const invoke = createInvokeHandler(commands);
    const settings = {
      id: board.id,
      name: "Morning",
      image_model: "gpt-image-2",
      video_model: "veo-3.1-openrouter",
    };
    expect(await invoke("update_storyboard_settings", settings)).toMatchObject({
      ok: true,
      value: {
        name: "Morning",
        image_model: "gpt-image-2",
        video_model: "veo-3.1-openrouter",
      },
    });
    expect(
      await invoke("update_storyboard_settings", {
        ...settings,
        name: "Should not save",
        video_model: "",
      }),
    ).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(commands.get_storyboard({ id: board.id })).toMatchObject({
      name: "Morning",
      image_model: "gpt-image-2",
      video_model: "veo-3.1-openrouter",
    });
  } finally {
    db.close();
  }
});
