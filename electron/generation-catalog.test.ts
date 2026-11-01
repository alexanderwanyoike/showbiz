import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { createGenerationModelCommands } from "./commands/generation-models";
import { createTestDataCommands as createDataCommands } from "./test-support/data-commands";
import { openTestDb } from "./db.test";

const directories: string[] = [];
afterEach(() =>
  directories
    .splice(0)
    .forEach((directory) =>
      fs.rmSync(directory, { recursive: true, force: true }),
    ),
);

it("uses renderer configuration validation and identifies the failing catalog filename and cause", () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "showbiz-model-catalog-"),
  );
  directories.push(directory);
  fs.mkdirSync(path.join(directory, "image"));
  fs.mkdirSync(path.join(directory, "video"));
  const model = JSON.parse(
    fs.readFileSync("src/lib/models/providers/image/local-image.json", "utf8"),
  ) as Record<string, unknown>;
  fs.writeFileSync(
    path.join(directory, "image", "broken.json"),
    JSON.stringify({ ...model, transport: "not-installed" }),
  );
  expect(
    createGenerationModelCommands(directory).get_generation_models(),
  ).toMatchObject({
    ok: false,
    error: {
      message: expect.stringMatching(
        /broken\.json.*unknown transport.*not-installed/,
      ),
    },
  });
});

it("keeps catalog discovery out of document-scoped commands", () => {
  const db = openTestDb();
  try {
    expect(createDataCommands(db, "/unused")).not.toHaveProperty(
      "get_generation_models",
    );
  } finally {
    db.close();
  }
});

it("rejects unknown, disabled and wrong-kind shot overrides without changing the current selection", () => {
  const db = openTestDb();
  try {
    const commands = createDataCommands(db, "/unused");
    const project = commands.create_project({ name: "Film" });
    const board = commands.create_storyboard({
      projectId: project.id,
      name: "Opening",
    });
    const shot = commands.create_shot({ storyboardId: board.id });
    for (const image_model of ["retired-model", "local-video", "imagen4"]) {
      expect(
        commands.set_shot_models({ shot_id: shot.id, image_model }),
      ).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
      expect(commands.get_shots({ storyboardId: board.id })[0]).toMatchObject({
        image_model: null,
      });
    }
  } finally {
    db.close();
  }
});
