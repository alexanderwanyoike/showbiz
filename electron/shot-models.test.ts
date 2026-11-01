import { expect, it } from "vitest";
import { openTestDb } from "./db.test";
import { createProjectCommands } from "./commands/projects";
import { createTestShotCommands as createShotCommands } from "./test-support/data-commands";

it("persists independent shot model overrides and restores inheritance without changing the board defaults", () => {
  const db = openTestDb();
  try {
    db.prepare("INSERT INTO projects(id,name) VALUES ('project','Film')").run();
    db.prepare(
      "INSERT INTO storyboards(id,project_id,name,image_model,video_model) VALUES ('board','project','Opening','imagen4','seedance-2-fal')",
    ).run();
    const commands = createShotCommands(db, "/unused-media");
    const first = commands.create_shot({ storyboardId: "board" });
    const second = commands.create_shot({ storyboardId: "board" });
    expect(first).toMatchObject({ image_model: null, video_model: null });
    expect(
      commands.set_shot_models({
        shot_id: first.id,
        image_model: "gpt-image-2",
        video_model: "veo-3.1-fal",
      }),
    ).toMatchObject({
      ok: true,
      value: { image_model: "gpt-image-2", video_model: "veo-3.1-fal" },
    });
    expect(commands.get_shots({ storyboardId: "board" })[0]).toMatchObject({
      image_model: "gpt-image-2",
      video_model: "veo-3.1-fal",
    });
    expect(commands.get_shots({ storyboardId: "board" })[1]).toMatchObject({
      id: second.id,
      image_model: null,
      video_model: null,
    });
    expect(
      commands.set_shot_models({ shot_id: first.id, image_model: null }),
    ).toMatchObject({
      ok: true,
      value: { image_model: null, video_model: "veo-3.1-fal" },
    });
    expect(
      db
        .prepare(
          "SELECT image_model,video_model FROM storyboards WHERE id='board'",
        )
        .get(),
    ).toMatchObject({ image_model: "imagen4", video_model: "seedance-2-fal" });
  } finally {
    db.close();
  }
});

it("starts new storyboards with available image and video model defaults", () => {
  const db = openTestDb();
  try {
    db.prepare("INSERT INTO projects(id,name) VALUES ('project','Film')").run();
    const commands = createProjectCommands(db, "/unused-media");
    expect(
      commands.create_storyboard({ projectId: "project", name: "New" }),
    ).toMatchObject({
      image_model: "nano-banana-2",
      video_model: "seedance-2-fal",
    });
  } finally {
    db.close();
  }
});
