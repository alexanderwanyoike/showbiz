import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { openTestDb } from "../db.test";
import { generateId } from "../db";
import {
  buildTree,
  getNextVersionNumber,
  createVideoVersionCommands,
  type VideoVersion,
} from "./video-versions";

// -- shared fixtures (mirror the Rust #[cfg(test)] helpers) --

function insertProjectAndStoryboard(db: DatabaseSync): [string, string] {
  const projId = generateId("proj");
  const sbId = generateId("sb");
  db.prepare("INSERT INTO projects (id, name) VALUES (?, 'Test Project')").run(projId);
  db.prepare(
    "INSERT INTO storyboards (id, project_id, name) VALUES (?, ?, 'Test SB')"
  ).run(sbId, projId);
  return [projId, sbId];
}

function insertShot(db: DatabaseSync, sbId: string): string {
  const shotId = generateId("shot");
  db.prepare(
    `INSERT INTO shots (id, storyboard_id, "order", status) VALUES (?, ?, 1, 'pending')`
  ).run(shotId, sbId);
  return shotId;
}

function makeVersion(id: string, parent: string | null, num: number): VideoVersion {
  return {
    id,
    shot_id: "shot-1",
    parent_version_id: parent,
    version_number: num,
    edit_type: "generation",
    video_path: `videos/versions/shot-1/v${num}.mp4`,
    prompt: "test prompt",
    settings_json: null,
    model_id: null,
    is_current: false,
    created_at: "2024-01-01",
    video_url: "",
  };
}

// ---- schema / helper tests (mirror video_versions.rs #[cfg(test)]) ----

describe("video_versions schema parity", () => {
  it("test_video_versions_table_created", () => {
    const db = openTestDb();
    const { n } = db
      .prepare("SELECT COUNT(*) AS n FROM video_versions")
      .get() as { n: number };
    expect(n).toBe(0);
  });

  it("test_video_version_insert_and_query", () => {
    const db = openTestDb();
    const [, sbId] = insertProjectAndStoryboard(db);
    const shotId = insertShot(db, sbId);

    const verId = generateId("vidver");
    db.prepare(
      `INSERT INTO video_versions (id, shot_id, version_number, edit_type, video_path, prompt, is_current)
       VALUES (?, ?, 1, 'generation', 'videos/versions/test/v1.mp4', 'test prompt', 1)`
    ).run(verId, shotId);

    const { n } = db
      .prepare("SELECT COUNT(*) AS n FROM video_versions WHERE shot_id = ?")
      .get(shotId) as { n: number };
    expect(n).toBe(1);
  });

  it("test_video_version_cascade_delete", () => {
    const db = openTestDb();
    const [, sbId] = insertProjectAndStoryboard(db);
    const shotId = insertShot(db, sbId);

    const verId = generateId("vidver");
    db.prepare(
      `INSERT INTO video_versions (id, shot_id, version_number, edit_type, video_path, is_current)
       VALUES (?, ?, 1, 'generation', 'videos/versions/test/v1.mp4', 1)`
    ).run(verId, shotId);

    db.prepare("DELETE FROM shots WHERE id = ?").run(shotId);

    const { n } = db
      .prepare("SELECT COUNT(*) AS n FROM video_versions WHERE shot_id = ?")
      .get(shotId) as { n: number };
    expect(n).toBe(0);
  });

  it("test_edit_type_check_constraint", () => {
    const db = openTestDb();
    const [, sbId] = insertProjectAndStoryboard(db);
    const shotId = insertShot(db, sbId);

    for (const editType of ["generation", "regeneration", "extend"]) {
      const verId = generateId("vidver");
      expect(() =>
        db
          .prepare(
            `INSERT INTO video_versions (id, shot_id, version_number, edit_type, video_path, is_current)
             VALUES (?, ?, 1, ?, 'videos/v1.mp4', 0)`
          )
          .run(verId, shotId, editType)
      ).not.toThrow();
    }

    expect(() =>
      db
        .prepare(
          `INSERT INTO video_versions (id, shot_id, version_number, edit_type, video_path, is_current)
           VALUES (?, ?, 1, 'invalid', 'videos/v1.mp4', 0)`
        )
        .run(generateId("vidver"), shotId)
    ).toThrow();
  });
});

describe("getNextVersionNumber", () => {
  it("test_next_version_number", () => {
    const db = openTestDb();
    const [, sbId] = insertProjectAndStoryboard(db);
    const shotId = insertShot(db, sbId);

    expect(getNextVersionNumber(db, shotId)).toBe(1);

    db.prepare(
      `INSERT INTO video_versions (id, shot_id, version_number, edit_type, video_path, is_current)
       VALUES (?, ?, 1, 'generation', 'videos/v1.mp4', 1)`
    ).run(generateId("vidver"), shotId);

    expect(getNextVersionNumber(db, shotId)).toBe(2);
  });
});

describe("buildTree", () => {
  it("test_build_tree_linear", () => {
    const tree = buildTree([
      makeVersion("a", null, 1),
      makeVersion("b", "a", 2),
      makeVersion("c", "b", 3),
    ]);
    expect(tree.length).toBe(1);
    expect(tree[0].version.id).toBe("a");
    expect(tree[0].children.length).toBe(1);
    expect(tree[0].children[0].version.id).toBe("b");
    expect(tree[0].children[0].children.length).toBe(1);
    expect(tree[0].children[0].children[0].version.id).toBe("c");
  });

  it("test_build_tree_branching", () => {
    const tree = buildTree([
      makeVersion("a", null, 1),
      makeVersion("b", "a", 2),
      makeVersion("c", "a", 3),
    ]);
    expect(tree.length).toBe(1);
    expect(tree[0].children.length).toBe(2);
  });

  it("treats a version with a missing parent as a root", () => {
    const tree = buildTree([makeVersion("b", "ghost", 2)]);
    expect(tree.length).toBe(1);
    expect(tree[0].version.id).toBe("b");
  });
});

// ---- command tests (temp media dir for file side effects) ----

describe("createVideoVersionCommands", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "showbiz-vidver-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function setup() {
    const db = openTestDb();
    const [, sbId] = insertProjectAndStoryboard(db);
    const shotId = insertShot(db, sbId);
    const commands = createVideoVersionCommands(db, tmpDir);
    return { db, shotId, commands };
  }

  describe("create_video_generation_version", () => {
    it("writes the video to disk and returns a version with an absolute video_url", () => {
      const { db, shotId, commands } = setup();

      const ver = commands.create_video_generation_version({
        shotId,
        videoData: [1, 2, 3, 4],
        mimeType: "video/mp4",
        prompt: "a cat",
        settingsJson: null,
        modelId: "veo-3",
        parentVersionId: null,
      });

      expect(ver.shot_id).toBe(shotId);
      expect(ver.version_number).toBe(1);
      expect(ver.edit_type).toBe("generation");
      expect(ver.prompt).toBe("a cat");
      expect(ver.model_id).toBe("veo-3");
      expect(ver.settings_json).toBeNull();
      expect(ver.parent_version_id).toBeNull();
      expect(ver.is_current).toBe(true);
      expect(ver.video_path).toBe(`videos/versions/${shotId}/v1.mp4`);
      expect(ver.video_url).toBe(path.join(tmpDir, ver.video_path));

      const onDisk = fs.readFileSync(path.join(tmpDir, ver.video_path));
      expect(Array.from(onDisk)).toEqual([1, 2, 3, 4]);

      // Shot row updated to point at the new version.
      const shot = db
        .prepare("SELECT video_path, status FROM shots WHERE id = ?")
        .get(shotId) as { video_path: string; status: string };
      expect(shot.video_path).toBe(ver.video_path);
      expect(shot.status).toBe("complete");
    });

    it("increments the version number and flips is_current to the newest", () => {
      const { db, shotId, commands } = setup();

      const v1 = commands.create_video_generation_version({
        shotId,
        videoData: [0],
        mimeType: "video/mp4",
        prompt: null,
        settingsJson: null,
        modelId: null,
        parentVersionId: null,
      });
      const v2 = commands.create_video_generation_version({
        shotId,
        videoData: [0],
        mimeType: "video/webm",
        prompt: null,
        settingsJson: null,
        modelId: null,
        parentVersionId: v1.id,
      });

      expect(v2.version_number).toBe(2);
      expect(v2.edit_type).toBe("regeneration");
      expect(v2.parent_version_id).toBe(v1.id);
      expect(v2.video_path).toBe(`videos/versions/${shotId}/v2.webm`);

      const rows = db
        .prepare(
          "SELECT id, is_current FROM video_versions WHERE shot_id = ? ORDER BY version_number"
        )
        .all(shotId) as { id: string; is_current: number }[];
      expect(rows.map((r) => r.is_current)).toEqual([0, 1]);
    });
  });

  describe("get_video_version_count", () => {
    it("counts versions for a shot", () => {
      const { shotId, commands } = setup();
      expect(commands.get_video_version_count({ shotId })).toBe(0);

      commands.create_video_generation_version({
        shotId,
        videoData: [0],
        mimeType: "video/mp4",
        prompt: null,
        settingsJson: null,
        modelId: null,
        parentVersionId: null,
      });
      expect(commands.get_video_version_count({ shotId })).toBe(1);
    });
  });

  describe("get_current_video_version", () => {
    it("returns null when there are no versions", () => {
      const { shotId, commands } = setup();
      expect(commands.get_current_video_version({ shotId })).toBeNull();
    });

    it("returns the current version with a boolean is_current and absolute url", () => {
      const { shotId, commands } = setup();
      const created = commands.create_video_generation_version({
        shotId,
        videoData: [9],
        mimeType: "video/mp4",
        prompt: null,
        settingsJson: null,
        modelId: null,
        parentVersionId: null,
      });

      const current = commands.get_current_video_version({ shotId });
      expect(current).not.toBeNull();
      expect(current!.id).toBe(created.id);
      expect(current!.is_current).toBe(true);
      expect(current!.video_url).toBe(path.join(tmpDir, current!.video_path));
    });
  });

  describe("get_video_versions", () => {
    it("returns an empty list for a shot with no versions", () => {
      const { shotId, commands } = setup();
      expect(commands.get_video_versions({ shotId })).toEqual([]);
    });

    it("builds a tree ordered by created_at with url and boolean is_current", () => {
      const { db, shotId, commands } = setup();

      const root = generateId("vidver");
      const child = generateId("vidver");
      db.prepare(
        `INSERT INTO video_versions (id, shot_id, parent_version_id, version_number, edit_type, video_path, is_current, created_at)
         VALUES (?, ?, NULL, 1, 'generation', 'videos/versions/x/v1.mp4', 0, '2024-01-01 00:00:00')`
      ).run(root, shotId);
      db.prepare(
        `INSERT INTO video_versions (id, shot_id, parent_version_id, version_number, edit_type, video_path, is_current, created_at)
         VALUES (?, ?, ?, 2, 'regeneration', 'videos/versions/x/v2.mp4', 1, '2024-01-01 00:00:01')`
      ).run(child, shotId, root);

      const tree = commands.get_video_versions({ shotId });
      expect(tree.length).toBe(1);
      expect(tree[0].version.id).toBe(root);
      expect(tree[0].version.is_current).toBe(false);
      expect(tree[0].version.video_url).toBe(
        path.join(tmpDir, "videos/versions/x/v1.mp4")
      );
      expect(tree[0].children.length).toBe(1);
      expect(tree[0].children[0].version.id).toBe(child);
      expect(tree[0].children[0].version.is_current).toBe(true);
    });
  });

  describe("switch_to_video_version", () => {
    it("flips is_current, updates the shot row, and returns the version", () => {
      const { db, shotId, commands } = setup();

      const v1 = commands.create_video_generation_version({
        shotId,
        videoData: [0],
        mimeType: "video/mp4",
        prompt: null,
        settingsJson: null,
        modelId: null,
        parentVersionId: null,
      });
      const v2 = commands.create_video_generation_version({
        shotId,
        videoData: [0],
        mimeType: "video/mp4",
        prompt: null,
        settingsJson: null,
        modelId: null,
        parentVersionId: v1.id,
      });

      const switched = commands.switch_to_video_version({
        shotId,
        versionId: v1.id,
      });
      expect(switched.id).toBe(v1.id);
      expect(switched.is_current).toBe(true);

      const rows = db
        .prepare(
          "SELECT id, is_current FROM video_versions WHERE shot_id = ? ORDER BY version_number"
        )
        .all(shotId) as { id: string; is_current: number }[];
      expect(rows).toEqual([
        { id: v1.id, is_current: 1 },
        { id: v2.id, is_current: 0 },
      ]);

      const shot = db
        .prepare("SELECT video_path, status FROM shots WHERE id = ?")
        .get(shotId) as { video_path: string; status: string };
      expect(shot.video_path).toBe(v1.video_path);
      expect(shot.status).toBe("complete");
    });

    it("throws when the version does not exist", () => {
      const { shotId, commands } = setup();
      expect(() =>
        commands.switch_to_video_version({ shotId, versionId: "does-not-exist" })
      ).toThrow();
    });
  });
});
