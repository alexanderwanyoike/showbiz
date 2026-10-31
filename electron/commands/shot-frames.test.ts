import { expect, it } from "vitest";
import { openTestDb } from "../db.test";
import { createDataCommands } from "../command-map";
import { createInvokeHandler } from "../ipc";
it("removes only the selected start frame while preserving image takes and saved video", async () => {
  const db = openTestDb();
  try {
    const commands = createDataCommands(db, "/unused");
    const project = commands.create_project({ name: "Film" });
    const board = commands.create_storyboard({
      projectId: project.id,
      name: "Opening",
    });
    const shot = commands.create_shot({ storyboardId: board.id });
    db.prepare(
      "UPDATE shots SET image_path='frame.png',video_path='video.mp4' WHERE id=?",
    ).run(shot.id);
    db.prepare(
      "INSERT INTO image_versions(id,shot_id,version_number,edit_type,image_path,is_current) VALUES ('take',?,1,'generation','frame.png',1)",
    ).run(shot.id);
    expect(
      await createInvokeHandler(commands)("clear_shot_start_frame", {
        shot_id: shot.id,
      }),
    ).toMatchObject({ ok: true });
    expect(commands.get_shots({ storyboardId: board.id })[0]).toMatchObject({
      image_path: null,
      image_url: null,
      video_path: "video.mp4",
    });
    const versions = commands.get_image_versions({ shotId: shot.id });
    expect(versions).toHaveLength(1);
    expect(versions[0].version).toMatchObject({
      id: "take",
      image_path: "frame.png",
      is_current: false,
    });
  } finally {
    db.close();
  }
});
