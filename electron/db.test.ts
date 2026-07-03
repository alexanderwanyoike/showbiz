import { describe, it, expect } from "vitest";
import path from "node:path";
import { appDataDir, generateId, loadMigrations, migrate, openDatabase } from "./db";
import { DatabaseSync } from "node:sqlite";

export const MIGRATIONS_DIR = path.resolve(
  import.meta.dirname,
  "../src-tauri/src/migrations"
);

/** In-memory DB with all migrations applied, mirroring Rust's open_test_db(). */
export function openTestDb(): DatabaseSync {
  return openDatabase(":memory:", loadMigrations(MIGRATIONS_DIR));
}

describe("appDataDir", () => {
  it("uses XDG_DATA_HOME on Linux when set", () => {
    expect(appDataDir("linux", { XDG_DATA_HOME: "/xdg/data" }, "/home/u")).toBe(
      "/xdg/data/com.showbiz.app"
    );
  });

  it("falls back to ~/.local/share on Linux", () => {
    expect(appDataDir("linux", {}, "/home/u")).toBe(
      "/home/u/.local/share/com.showbiz.app"
    );
  });

  it("uses Application Support on macOS", () => {
    expect(appDataDir("darwin", {}, "/Users/u")).toBe(
      "/Users/u/Library/Application Support/com.showbiz.app"
    );
  });

  it("uses roaming APPDATA on Windows", () => {
    expect(
      appDataDir("win32", { APPDATA: "C:\\Users\\u\\AppData\\Roaming" }, "C:\\Users\\u")
    ).toBe(path.join("C:\\Users\\u\\AppData\\Roaming", "com.showbiz.app"));
  });
});

describe("generateId (parity with Rust generate_id)", () => {
  it("has the prefix-timestamp-random format", () => {
    const id = generateId("sb");
    const parts = id.split("-");
    expect(parts.length).toBe(3);
    expect(parts[0]).toBe("sb");
    expect(Number.isInteger(Number(parts[1]))).toBe(true);
    expect(parts[2].length).toBe(7);
  });

  it("embeds the current timestamp", () => {
    const before = Date.now();
    const id = generateId("test");
    const after = Date.now();
    const ts = Number(id.split("-")[1]);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("is unique across many calls", () => {
    const ids = Array.from({ length: 100 }, () => generateId("x"));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("loadMigrations", () => {
  it("loads the shipped migrations in numeric order", () => {
    const migrations = loadMigrations(MIGRATIONS_DIR);
    expect(migrations.length).toBe(2);
    expect(migrations[0]).toContain("CREATE TABLE IF NOT EXISTS projects");
    expect(migrations[1]).toContain("trim_in");
  });
});

describe("migrate", () => {
  it("applies all migrations and tracks user_version", () => {
    const db = openTestDb();
    const row = db.prepare("PRAGMA user_version").get() as {
      user_version: number;
    };
    expect(row.user_version).toBe(2);
  });

  it("is idempotent for an already-migrated database", () => {
    const db = openTestDb();
    migrate(db, loadMigrations(MIGRATIONS_DIR));
    const row = db.prepare("PRAGMA user_version").get() as {
      user_version: number;
    };
    expect(row.user_version).toBe(2);
  });

  it("refuses a database that is ahead of the known migrations", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA user_version = 99");
    expect(() => migrate(db, loadMigrations(MIGRATIONS_DIR))).toThrow(
      /ahead/i
    );
  });
});

describe("schema parity with Rust db.rs tests", () => {
  it("creates the bible tables", () => {
    const db = openTestDb();
    for (const table of ["bibles", "bible_assets", "bible_asset_variants"]) {
      const row = db
        .prepare(
          "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?"
        )
        .get(table) as { n: number };
      expect(row.n, `missing table ${table}`).toBe(1);
    }
  });

  it("shots have end_frame_path", () => {
    const db = openTestDb();
    const columns = (
      db.prepare("PRAGMA table_info(shots)").all() as { name: string }[]
    ).map((c) => c.name);
    expect(columns).toContain("end_frame_path");
  });

  it("timeline_clips have trim and version-pin columns", () => {
    const db = openTestDb();
    const columns = (
      db.prepare("PRAGMA table_info(timeline_clips)").all() as { name: string }[]
    ).map((c) => c.name);
    for (const column of ["trim_in", "trim_out", "video_version_id"]) {
      expect(columns).toContain(column);
    }
  });

  it("enforces foreign keys after open", () => {
    const db = openTestDb();
    expect(() =>
      db
        .prepare("INSERT INTO storyboards (id, project_id, name) VALUES (?, ?, ?)")
        .run("sb1", "no-such-project", "SB")
    ).toThrow();
  });

  it("creating a project creates its Main Bible via trigger", () => {
    const db = openTestDb();
    db.prepare("INSERT INTO projects (id, name) VALUES (?, ?)").run(
      "p1",
      "Series"
    );
    const row = db
      .prepare("SELECT name FROM bibles WHERE project_id = ?")
      .get("p1") as { name: string };
    expect(row.name).toBe("Main Bible");
  });

  it("deleting a project cascades to storyboards and shots", () => {
    const db = openTestDb();
    db.prepare("INSERT INTO projects (id, name) VALUES (?, ?)").run("p1", "P");
    db.prepare(
      "INSERT INTO storyboards (id, project_id, name) VALUES (?, ?, ?)"
    ).run("sb1", "p1", "SB");
    db.prepare(
      `INSERT INTO shots (id, storyboard_id, "order", status) VALUES (?, ?, 1, 'pending')`
    ).run("sh1", "sb1");

    db.prepare("DELETE FROM projects WHERE id = ?").run("p1");

    const storyboards = db
      .prepare("SELECT COUNT(*) AS n FROM storyboards")
      .get() as { n: number };
    const shots = db.prepare("SELECT COUNT(*) AS n FROM shots").get() as {
      n: number;
    };
    expect(storyboards.n).toBe(0);
    expect(shots.n).toBe(0);
  });
});
