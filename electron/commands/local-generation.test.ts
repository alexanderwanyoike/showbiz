import { expect, it } from "vitest";
import { openTestDb } from "../db.test";
import { createLocalGenerationCommands } from "./local-generation";
it("keeps configurable local endpoint and model names in device settings with typed validation", () => {
  const db = openTestDb();
  try {
    const commands = createLocalGenerationCommands(db);
    expect(commands.get_local_generation_config()).toMatchObject({
      ok: true,
      value: {
        endpoint: "http://127.0.0.1:8080",
        image_model: "",
        video_model: "",
      },
    });
    expect(
      commands.set_local_generation_config({
        endpoint: "http://localhost:8080/",
        image_model: "my-sdxl",
        video_model: "wan",
      }),
    ).toMatchObject({ ok: true });
    expect(
      createLocalGenerationCommands(db).get_local_generation_config(),
    ).toMatchObject({
      ok: true,
      value: {
        endpoint: "http://localhost:8080",
        image_model: "my-sdxl",
        video_model: "wan",
      },
    });
    expect(
      commands.set_local_generation_config({
        endpoint: "file:///tmp",
        image_model: "model",
        video_model: "wan",
      }),
    ).toMatchObject({ ok: false });
    expect(commands.get_local_generation_config()).toMatchObject({
      ok: true,
      value: { image_model: "my-sdxl" },
    });
  } finally {
    db.close();
  }
});

it("rejects an API-suffixed address that would duplicate the LocalAI path", () => {
  const db = openTestDb();
  try {
    const commands = createLocalGenerationCommands(db);
    expect(
      commands.set_local_generation_config({
        endpoint: "http://127.0.0.1:8080/v1",
        image_model: "my-model",
        video_model: "my-video",
      }),
    ).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(commands.get_local_generation_config()).toMatchObject({
      ok: true,
      value: { endpoint: "http://127.0.0.1:8080" },
    });
  } finally {
    db.close();
  }
});
