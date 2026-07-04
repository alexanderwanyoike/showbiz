import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { openTestDb } from "../db.test";
import { createProjectCommands } from "./projects";

/** Throwaway media base dir for tests that never touch media files. */
function tmpMediaDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "showbiz-projects-"));
}

describe("get_projects", () => {
  it("returns an empty list for a fresh database", () => {
    const commands = createProjectCommands(openTestDb(), tmpMediaDir());
    expect(commands.get_projects()).toEqual([]);
  });

  it("returns projects with the same shape as the Rust command", () => {
    const db = openTestDb();
    db.prepare("INSERT INTO projects (id, name) VALUES (?, ?)").run(
      "proj-1",
      "My Project"
    );

    const projects = createProjectCommands(db, tmpMediaDir()).get_projects();
    expect(projects.length).toBe(1);
    const project = projects[0];
    expect(project.id).toBe("proj-1");
    expect(project.name).toBe("My Project");
    expect(typeof project.created_at).toBe("string");
    expect(typeof project.updated_at).toBe("string");
    expect(Object.keys(project).sort()).toEqual([
      "created_at",
      "id",
      "name",
      "updated_at",
    ]);
  });

  it("orders projects by updated_at descending", () => {
    const db = openTestDb();
    const insert = db.prepare(
      "INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)"
    );
    insert.run("proj-old", "Old", "2026-01-01 00:00:00", "2026-01-01 00:00:00");
    insert.run("proj-new", "New", "2026-01-01 00:00:00", "2026-02-01 00:00:00");

    const projects = createProjectCommands(db, tmpMediaDir()).get_projects();
    expect(projects.map((p) => p.id)).toEqual(["proj-new", "proj-old"]);
  });
});

describe("get_project", () => {
  it("returns the project for an existing id", () => {
    const db = openTestDb();
    db.prepare("INSERT INTO projects (id, name) VALUES (?, ?)").run(
      "proj-1",
      "My Project"
    );
    const project = createProjectCommands(db, tmpMediaDir()).get_project({
      id: "proj-1",
    });
    expect(project?.id).toBe("proj-1");
    expect(project?.name).toBe("My Project");
  });

  it("returns null when the project does not exist", () => {
    const db = openTestDb();
    expect(
      createProjectCommands(db, tmpMediaDir()).get_project({ id: "nope" })
    ).toBeNull();
  });
});

describe("create_project", () => {
  it("creates a project with a generated id and DB timestamps (parity: create_and_get_project)", () => {
    const db = openTestDb();
    const project = createProjectCommands(db, tmpMediaDir()).create_project({
      name: "My Project",
    });
    expect(project.name).toBe("My Project");
    expect(project.id.startsWith("proj-")).toBe(true);
    expect(typeof project.created_at).toBe("string");
    expect(typeof project.updated_at).toBe("string");

    const roundTrip = db
      .prepare("SELECT name FROM projects WHERE id = ?")
      .get(project.id) as { name: string };
    expect(roundTrip.name).toBe("My Project");
  });
});

describe("update_project", () => {
  it("updates the name (parity: update_project_name)", () => {
    const db = openTestDb();
    const commands = createProjectCommands(db, tmpMediaDir());
    const { id } = commands.create_project({ name: "Old Name" });

    const updated = commands.update_project({ id, name: "New Name" });
    expect(updated.name).toBe("New Name");

    const stored = db
      .prepare("SELECT name FROM projects WHERE id = ?")
      .get(id) as { name: string };
    expect(stored.name).toBe("New Name");
  });
});

describe("delete_project", () => {
  it("cascades to storyboards and shots (parity: cascade_delete_project)", () => {
    const db = openTestDb();
    const commands = createProjectCommands(db, tmpMediaDir());

    db.prepare("INSERT INTO projects (id, name) VALUES (?, ?)").run("p1", "P");
    db.prepare(
      "INSERT INTO storyboards (id, project_id, name) VALUES (?, ?, ?)"
    ).run("sb1", "p1", "SB");
    db.prepare(
      `INSERT INTO shots (id, storyboard_id, "order", status) VALUES (?, ?, 1, 'pending')`
    ).run("sh1", "sb1");

    expect(commands.delete_project({ id: "p1" })).toBe(true);

    const sbCount = db
      .prepare("SELECT COUNT(*) AS n FROM storyboards WHERE id = ?")
      .get("sb1") as { n: number };
    const shotCount = db
      .prepare("SELECT COUNT(*) AS n FROM shots WHERE id = ?")
      .get("sh1") as { n: number };
    expect(sbCount.n).toBe(0);
    expect(shotCount.n).toBe(0);
  });

  it("returns false when nothing was deleted", () => {
    const db = openTestDb();
    expect(
      createProjectCommands(db, tmpMediaDir()).delete_project({ id: "nope" })
    ).toBe(false);
  });

  it("deletes shot and bible media files before removing the row", () => {
    const db = openTestDb();
    const mediaDir = tmpMediaDir();
    const commands = createProjectCommands(db, mediaDir);

    const { id: projectId } = commands.create_project({ name: "P" });
    const { id: sbId } = commands.create_storyboard({ projectId, name: "SB" });

    const imageRel = "images/sh1.png";
    const videoRel = "videos/sh1.mp4";
    seedShotWithMedia(db, sbId, "sh1", imageRel, videoRel);

    // Version + mask directories for the shot.
    const versionDir = path.join(mediaDir, "images", "versions", "sh1");
    const maskDir = path.join(mediaDir, "masks", "sh1");
    writeFile(path.join(versionDir, "v1.png"), "v");
    writeFile(path.join(maskDir, "v1.png"), "m");
    writeFile(path.join(mediaDir, imageRel), "img");
    writeFile(path.join(mediaDir, videoRel), "vid");

    // Bible media (the Main Bible is auto-created by trigger).
    const bibleId = (
      db
        .prepare("SELECT id FROM bibles WHERE project_id = ?")
        .get(projectId) as { id: string }
    ).id;
    const bibleDir = path.join(mediaDir, "bible", bibleId);
    writeFile(path.join(bibleDir, "variant.png"), "b");

    expect(commands.delete_project({ id: projectId })).toBe(true);

    expect(fs.existsSync(path.join(mediaDir, imageRel))).toBe(false);
    expect(fs.existsSync(path.join(mediaDir, videoRel))).toBe(false);
    expect(fs.existsSync(versionDir)).toBe(false);
    expect(fs.existsSync(maskDir)).toBe(false);
    expect(fs.existsSync(bibleDir)).toBe(false);
  });
});

describe("get_storyboards", () => {
  it("returns storyboards for a project ordered by updated_at descending", () => {
    const db = openTestDb();
    db.prepare("INSERT INTO projects (id, name) VALUES (?, ?)").run("p1", "P");
    const insert = db.prepare(
      "INSERT INTO storyboards (id, project_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    );
    insert.run("sb-old", "p1", "Old", "2026-01-01 00:00:00", "2026-01-01 00:00:00");
    insert.run("sb-new", "p1", "New", "2026-01-01 00:00:00", "2026-02-01 00:00:00");
    // Belongs to another project, must be excluded.
    db.prepare("INSERT INTO projects (id, name) VALUES (?, ?)").run("p2", "P2");
    insert.run("sb-other", "p2", "Other", "2026-03-01 00:00:00", "2026-03-01 00:00:00");

    const storyboards = createProjectCommands(db, tmpMediaDir()).get_storyboards({
      projectId: "p1",
    });
    expect(storyboards.map((s) => s.id)).toEqual(["sb-new", "sb-old"]);
    expect(storyboards[0].image_model).toBe("imagen4");
    expect(storyboards[0].video_model).toBe("veo3");
  });
});

describe("get_storyboards_with_preview", () => {
  it("returns null preview when no shot has an image (parity: get_storyboards_with_preview_null_when_no_shots)", () => {
    const db = openTestDb();
    db.prepare("INSERT INTO projects (id, name) VALUES (?, ?)").run("p1", "P");
    db.prepare(
      "INSERT INTO storyboards (id, project_id, name) VALUES (?, ?, ?)"
    ).run("sb1", "p1", "SB");

    const [storyboard] = createProjectCommands(
      db,
      tmpMediaDir()
    ).get_storyboards_with_preview({ projectId: "p1" });
    expect(storyboard.preview_image_path).toBeNull();
  });

  it("returns the first shot image joined onto the media base dir as an absolute path", () => {
    const db = openTestDb();
    const mediaDir = tmpMediaDir();
    db.prepare("INSERT INTO projects (id, name) VALUES (?, ?)").run("p1", "P");
    db.prepare(
      "INSERT INTO storyboards (id, project_id, name) VALUES (?, ?, ?)"
    ).run("sb1", "p1", "SB");
    // Two shots; the lower "order" (and only one with an image) wins.
    db.prepare(
      `INSERT INTO shots (id, storyboard_id, "order", status) VALUES (?, ?, 1, 'pending')`
    ).run("sh0", "sb1");
    db.prepare(
      `INSERT INTO shots (id, storyboard_id, "order", status, image_path) VALUES (?, ?, 2, 'pending', ?)`
    ).run("sh1", "sb1", "images/sh1.png");

    const [storyboard] = createProjectCommands(
      db,
      mediaDir
    ).get_storyboards_with_preview({ projectId: "p1" });
    expect(storyboard.preview_image_path).toBe(
      path.join(mediaDir, "images/sh1.png")
    );
  });
});

describe("get_storyboard", () => {
  it("returns the storyboard for an existing id", () => {
    const db = openTestDb();
    db.prepare("INSERT INTO projects (id, name) VALUES (?, ?)").run("p1", "P");
    db.prepare(
      "INSERT INTO storyboards (id, project_id, name) VALUES (?, ?, ?)"
    ).run("sb1", "p1", "SB");

    const storyboard = createProjectCommands(db, tmpMediaDir()).get_storyboard({
      id: "sb1",
    });
    expect(storyboard?.id).toBe("sb1");
    expect(storyboard?.project_id).toBe("p1");
  });

  it("returns null when the storyboard does not exist", () => {
    const db = openTestDb();
    expect(
      createProjectCommands(db, tmpMediaDir()).get_storyboard({ id: "nope" })
    ).toBeNull();
  });
});

describe("create_storyboard", () => {
  it("creates a storyboard with a generated id and default models", () => {
    const db = openTestDb();
    const commands = createProjectCommands(db, tmpMediaDir());
    const { id: projectId } = commands.create_project({ name: "P" });

    const storyboard = commands.create_storyboard({ projectId, name: "SB" });
    expect(storyboard.id.startsWith("sb-")).toBe(true);
    expect(storyboard.project_id).toBe(projectId);
    expect(storyboard.name).toBe("SB");
    expect(storyboard.image_model).toBe("imagen4");
    expect(storyboard.video_model).toBe("veo3");
    expect(typeof storyboard.created_at).toBe("string");
  });
});

describe("update_storyboard", () => {
  it("updates the storyboard name", () => {
    const db = openTestDb();
    const commands = createProjectCommands(db, tmpMediaDir());
    const { id: projectId } = commands.create_project({ name: "P" });
    const { id } = commands.create_storyboard({ projectId, name: "Old" });

    const updated = commands.update_storyboard({ id, name: "New" });
    expect(updated.name).toBe("New");
  });
});

describe("update_storyboard_models", () => {
  it("updates the image and video models", () => {
    const db = openTestDb();
    const commands = createProjectCommands(db, tmpMediaDir());
    const { id: projectId } = commands.create_project({ name: "P" });
    const { id } = commands.create_storyboard({ projectId, name: "SB" });

    const updated = commands.update_storyboard_models({
      id,
      imageModel: "nano-banana",
      videoModel: "seedance",
    });
    expect(updated.image_model).toBe("nano-banana");
    expect(updated.video_model).toBe("seedance");
  });
});

describe("delete_storyboard", () => {
  it("cascades to shots and reports success", () => {
    const db = openTestDb();
    const commands = createProjectCommands(db, tmpMediaDir());
    db.prepare("INSERT INTO projects (id, name) VALUES (?, ?)").run("p1", "P");
    db.prepare(
      "INSERT INTO storyboards (id, project_id, name) VALUES (?, ?, ?)"
    ).run("sb1", "p1", "SB");
    db.prepare(
      `INSERT INTO shots (id, storyboard_id, "order", status) VALUES (?, ?, 1, 'pending')`
    ).run("sh1", "sb1");

    expect(commands.delete_storyboard({ id: "sb1" })).toBe(true);
    const shotCount = db
      .prepare("SELECT COUNT(*) AS n FROM shots WHERE id = ?")
      .get("sh1") as { n: number };
    expect(shotCount.n).toBe(0);
  });

  it("returns false when nothing was deleted", () => {
    const db = openTestDb();
    expect(
      createProjectCommands(db, tmpMediaDir()).delete_storyboard({ id: "nope" })
    ).toBe(false);
  });

  it("deletes shot media files before removing the row", () => {
    const db = openTestDb();
    const mediaDir = tmpMediaDir();
    const commands = createProjectCommands(db, mediaDir);
    db.prepare("INSERT INTO projects (id, name) VALUES (?, ?)").run("p1", "P");
    db.prepare(
      "INSERT INTO storyboards (id, project_id, name) VALUES (?, ?, ?)"
    ).run("sb1", "p1", "SB");

    const imageRel = "images/sh1.png";
    const videoRel = "videos/sh1.mp4";
    seedShotWithMedia(db, "sb1", "sh1", imageRel, videoRel);

    const versionDir = path.join(mediaDir, "images", "versions", "sh1");
    const maskDir = path.join(mediaDir, "masks", "sh1");
    writeFile(path.join(versionDir, "v1.png"), "v");
    writeFile(path.join(maskDir, "v1.png"), "m");
    writeFile(path.join(mediaDir, imageRel), "img");
    writeFile(path.join(mediaDir, videoRel), "vid");

    expect(commands.delete_storyboard({ id: "sb1" })).toBe(true);

    expect(fs.existsSync(path.join(mediaDir, imageRel))).toBe(false);
    expect(fs.existsSync(path.join(mediaDir, videoRel))).toBe(false);
    expect(fs.existsSync(versionDir)).toBe(false);
    expect(fs.existsSync(maskDir)).toBe(false);
  });
});

// -- test helpers --

function writeFile(filepath: string, contents: string): void {
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, contents);
}

function seedShotWithMedia(
  db: DatabaseSync,
  storyboardId: string,
  shotId: string,
  imagePath: string,
  videoPath: string
): void {
  db.prepare(
    `INSERT INTO shots (id, storyboard_id, "order", status, image_path, video_path)
     VALUES (?, ?, 1, 'pending', ?, ?)`
  ).run(shotId, storyboardId, imagePath, videoPath);
}
