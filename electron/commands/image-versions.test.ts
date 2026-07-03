import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { openTestDb } from "../db.test";
import {
  buildTree,
  createImageVersionCommands,
  type ImageVersion,
} from "./image-versions";

// A minimal valid base64 data URL (strict decoder + parseDataUrl accept it).
const PNG_DATA_URL = "data:image/png;base64,iVBORw0KGgo=";

/** Mirror of the Rust make_version test helper. */
function makeVersion(id: string, parent: string | null): ImageVersion {
  return {
    id,
    shot_id: "shot-1",
    parent_version_id: parent,
    version_number: 1,
    edit_type: "generation",
    image_path: `images/versions/shot-1/${id}.png`,
    prompt: "test prompt",
    edit_prompt: null,
    mask_path: null,
    is_current: false,
    created_at: "2024-01-01",
    image_url: null,
    mask_url: null,
  };
}

// -- buildTree unit tests, one-for-one with image_versions.rs #[cfg(test)] --

describe("buildTree (parity with Rust build_tree tests)", () => {
  it("build_tree_empty_list", () => {
    expect(buildTree([])).toEqual([]);
  });

  it("build_tree_single_root", () => {
    const result = buildTree([makeVersion("a", null)]);
    expect(result.length).toBe(1);
    expect(result[0].version.id).toBe("a");
    expect(result[0].children).toEqual([]);
  });

  it("build_tree_linear_chain", () => {
    const result = buildTree([
      makeVersion("a", null),
      makeVersion("b", "a"),
      makeVersion("c", "b"),
    ]);
    expect(result.length).toBe(1);
    expect(result[0].version.id).toBe("a");
    expect(result[0].children.length).toBe(1);
    expect(result[0].children[0].version.id).toBe("b");
    expect(result[0].children[0].children.length).toBe(1);
    expect(result[0].children[0].children[0].version.id).toBe("c");
  });

  it("build_tree_branching", () => {
    const result = buildTree([
      makeVersion("a", null),
      makeVersion("b", "a"),
      makeVersion("c", "a"),
    ]);
    expect(result.length).toBe(1);
    expect(result[0].version.id).toBe("a");
    expect(result[0].children.length).toBe(2);
    const childIds = result[0].children.map((c) => c.version.id);
    expect(childIds).toContain("b");
    expect(childIds).toContain("c");
  });

  it("build_tree_orphan_parent_treated_as_root", () => {
    const result = buildTree([
      makeVersion("a", null),
      makeVersion("b", "nonexistent"),
    ]);
    expect(result.length).toBe(2);
  });

  it("build_tree_multiple_roots", () => {
    const result = buildTree([
      makeVersion("a", null),
      makeVersion("b", null),
      makeVersion("c", "a"),
    ]);
    expect(result.length).toBe(2);
    const rootA = result.find((n) => n.version.id === "a")!;
    expect(rootA.children.length).toBe(1);
    const rootB = result.find((n) => n.version.id === "b")!;
    expect(rootB.children).toEqual([]);
  });
});

// -- command tests against a real in-memory DB + temp media dir --

describe("createImageVersionCommands", () => {
  let db: DatabaseSync;
  let mediaDir: string;
  let commands: ReturnType<typeof createImageVersionCommands>;

  const SHOT_ID = "shot-1";

  function seedShot(shotId = SHOT_ID) {
    db.prepare("INSERT INTO projects (id, name) VALUES (?, ?)").run("proj-1", "P");
    db.prepare(
      "INSERT INTO storyboards (id, project_id, name) VALUES (?, ?, ?)"
    ).run("sb-1", "proj-1", "SB");
    db.prepare(
      `INSERT INTO shots (id, storyboard_id, "order", status) VALUES (?, ?, 1, 'pending')`
    ).run(shotId, "sb-1");
  }

  function insertVersion(
    id: string,
    opts: {
      parent?: string | null;
      versionNumber?: number;
      editType?: string;
      imagePath?: string;
      maskPath?: string | null;
      isCurrent?: number;
      createdAt?: string;
      prompt?: string | null;
    } = {}
  ) {
    db.prepare(
      `INSERT INTO image_versions
         (id, shot_id, parent_version_id, version_number, edit_type, image_path, prompt, mask_path, is_current, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      SHOT_ID,
      opts.parent ?? null,
      opts.versionNumber ?? 1,
      opts.editType ?? "generation",
      opts.imagePath ?? `images/versions/${SHOT_ID}/${id}.png`,
      opts.prompt ?? "a prompt",
      opts.maskPath ?? null,
      opts.isCurrent ?? 0,
      opts.createdAt ?? "2024-01-01 00:00:00"
    );
  }

  beforeEach(() => {
    db = openTestDb();
    mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), "showbiz-imgver-"));
    commands = createImageVersionCommands(db, mediaDir);
    seedShot();
  });

  afterEach(() => {
    fs.rmSync(mediaDir, { recursive: true, force: true });
  });

  describe("get_image_versions", () => {
    it("returns an empty list for a shot with no versions", () => {
      expect(commands.get_image_versions({ shotId: SHOT_ID })).toEqual([]);
    });

    it("builds the tree ordered by created_at ascending", () => {
      insertVersion("v-c", { createdAt: "2024-01-03 00:00:00" });
      insertVersion("v-a", { createdAt: "2024-01-01 00:00:00" });
      insertVersion("v-b", { parent: "v-a", createdAt: "2024-01-02 00:00:00" });

      const tree = commands.get_image_versions({ shotId: SHOT_ID });
      // Two roots (v-a then v-c by created_at), v-b nested under v-a.
      expect(tree.map((n) => n.version.id)).toEqual(["v-a", "v-c"]);
      expect(tree[0].children.map((n) => n.version.id)).toEqual(["v-b"]);
    });

    it("returns absolute image_url, null mask_url and boolean is_current", () => {
      insertVersion("v1", { isCurrent: 1 });
      const [node] = commands.get_image_versions({ shotId: SHOT_ID });
      expect(node.version.image_url).toBe(
        path.join(mediaDir, `images/versions/${SHOT_ID}/v1.png`)
      );
      expect(node.version.mask_url).toBeNull();
      expect(node.version.is_current).toBe(true);
    });

    it("joins the mask path into an absolute mask_url when present", () => {
      insertVersion("v1", { maskPath: "masks/shot-1/v1.png" });
      const [node] = commands.get_image_versions({ shotId: SHOT_ID });
      expect(node.version.mask_url).toBe(
        path.join(mediaDir, "masks/shot-1/v1.png")
      );
    });
  });

  describe("switch_to_version", () => {
    it("flips is_current, updates the shot and returns the version", () => {
      insertVersion("v1", { isCurrent: 1, imagePath: "images/versions/shot-1/v1.png" });
      insertVersion("v2", {
        versionNumber: 2,
        imagePath: "images/versions/shot-1/v2.png",
        prompt: "second",
      });

      const version = commands.switch_to_version({ shotId: SHOT_ID, versionId: "v2" });
      expect(version.id).toBe("v2");
      expect(version.is_current).toBe(true);

      const rows = db
        .prepare("SELECT id, is_current FROM image_versions WHERE shot_id = ?")
        .all(SHOT_ID) as { id: string; is_current: number }[];
      const current = rows.filter((r) => r.is_current === 1).map((r) => r.id);
      expect(current).toEqual(["v2"]);

      const shot = db
        .prepare("SELECT image_path, image_prompt, video_path, status FROM shots WHERE id = ?")
        .get(SHOT_ID) as {
        image_path: string;
        image_prompt: string;
        video_path: string | null;
        status: string;
      };
      expect(shot.image_path).toBe("images/versions/shot-1/v2.png");
      expect(shot.image_prompt).toBe("second");
      expect(shot.video_path).toBeNull();
      expect(shot.status).toBe("pending");
    });

    it("throws when the version does not exist", () => {
      expect(() =>
        commands.switch_to_version({ shotId: SHOT_ID, versionId: "missing" })
      ).toThrow(/Version not found/);
    });
  });

  describe("create_generation_version", () => {
    it("writes the image, inserts a current root version and updates the shot", () => {
      const version = commands.create_generation_version({
        shotId: SHOT_ID,
        prompt: "a cat",
        imageBase64: PNG_DATA_URL,
        parentVersionId: null,
      });

      expect(version.version_number).toBe(1);
      expect(version.edit_type).toBe("generation");
      expect(version.parent_version_id).toBeNull();
      expect(version.is_current).toBe(true);
      expect(version.id.startsWith("imgver-")).toBe(true);

      // File side effect.
      expect(fs.existsSync(path.join(mediaDir, version.image_path))).toBe(true);
      expect(version.image_path).toBe(`images/versions/${SHOT_ID}/v1.png`);

      const shot = db
        .prepare("SELECT image_path, image_prompt, status FROM shots WHERE id = ?")
        .get(SHOT_ID) as { image_path: string; image_prompt: string; status: string };
      expect(shot.image_path).toBe(version.image_path);
      expect(shot.image_prompt).toBe("a cat");
      expect(shot.status).toBe("pending");
    });

    it("records edit_type regeneration when a parent is supplied and increments version_number", () => {
      commands.create_generation_version({
        shotId: SHOT_ID,
        prompt: "first",
        imageBase64: PNG_DATA_URL,
        parentVersionId: null,
      });
      const first = db
        .prepare("SELECT id FROM image_versions WHERE shot_id = ?")
        .get(SHOT_ID) as { id: string };

      const second = commands.create_generation_version({
        shotId: SHOT_ID,
        prompt: "second",
        imageBase64: PNG_DATA_URL,
        parentVersionId: first.id,
      });

      expect(second.edit_type).toBe("regeneration");
      expect(second.parent_version_id).toBe(first.id);
      expect(second.version_number).toBe(2);

      // Only the new version is current.
      const current = db
        .prepare("SELECT id FROM image_versions WHERE shot_id = ? AND is_current = 1")
        .all(SHOT_ID) as { id: string }[];
      expect(current.map((c) => c.id)).toEqual([second.id]);
    });
  });

  describe("create_remix_version", () => {
    it("inherits the parent prompt, records the edit_prompt and flips current", () => {
      const parent = commands.create_generation_version({
        shotId: SHOT_ID,
        prompt: "base prompt",
        imageBase64: PNG_DATA_URL,
        parentVersionId: null,
      });

      const remix = commands.create_remix_version({
        shotId: SHOT_ID,
        parentVersionId: parent.id,
        editPrompt: "make it night",
        resultImageBase64: PNG_DATA_URL,
      });

      expect(remix.edit_type).toBe("remix");
      expect(remix.parent_version_id).toBe(parent.id);
      expect(remix.prompt).toBe("base prompt");
      expect(remix.edit_prompt).toBe("make it night");
      expect(remix.version_number).toBe(2);
      expect(remix.is_current).toBe(true);
      expect(fs.existsSync(path.join(mediaDir, remix.image_path))).toBe(true);

      const shot = db
        .prepare("SELECT image_prompt FROM shots WHERE id = ?")
        .get(SHOT_ID) as { image_prompt: string };
      expect(shot.image_prompt).toBe("make it night");
    });
  });

  describe("get_version_image_base64", () => {
    it("returns a data URL for an existing version's file", () => {
      const version = commands.create_generation_version({
        shotId: SHOT_ID,
        prompt: "x",
        imageBase64: PNG_DATA_URL,
        parentVersionId: null,
      });
      const b64 = commands.get_version_image_base64({ versionId: version.id });
      expect(b64).toBe(PNG_DATA_URL);
    });

    it("returns null when the version id does not exist", () => {
      expect(commands.get_version_image_base64({ versionId: "missing" })).toBeNull();
    });

    it("returns null when the row exists but the file is gone", () => {
      insertVersion("v1", { imagePath: "images/versions/shot-1/gone.png" });
      expect(commands.get_version_image_base64({ versionId: "v1" })).toBeNull();
    });
  });

  describe("delete_version", () => {
    it("deletes the row and returns true", () => {
      insertVersion("v1");
      expect(commands.delete_version({ versionId: "v1" })).toBe(true);
      expect(commands.get_version_count({ shotId: SHOT_ID })).toBe(0);
    });

    it("returns false when nothing was deleted", () => {
      expect(commands.delete_version({ versionId: "missing" })).toBe(false);
    });

    it("reparents children to root via ON DELETE SET NULL", () => {
      insertVersion("v1", { createdAt: "2024-01-01 00:00:00" });
      insertVersion("v2", { parent: "v1", versionNumber: 2, createdAt: "2024-01-02 00:00:00" });

      commands.delete_version({ versionId: "v1" });

      const child = db
        .prepare("SELECT parent_version_id FROM image_versions WHERE id = ?")
        .get("v2") as { parent_version_id: string | null };
      expect(child.parent_version_id).toBeNull();

      const tree = commands.get_image_versions({ shotId: SHOT_ID });
      expect(tree.map((n) => n.version.id)).toEqual(["v2"]);
    });
  });

  describe("get_version_count", () => {
    it("counts the versions for a shot", () => {
      expect(commands.get_version_count({ shotId: SHOT_ID })).toBe(0);
      insertVersion("v1");
      insertVersion("v2", { versionNumber: 2 });
      expect(commands.get_version_count({ shotId: SHOT_ID })).toBe(2);
    });
  });
});
