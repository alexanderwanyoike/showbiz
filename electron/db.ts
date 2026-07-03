import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export const APP_IDENTIFIER = "com.showbiz.app";

/**
 * The Tauri-compatible per-user data directory. Both shells must resolve the
 * exact same directory during the migration, so this mirrors Tauri's
 * app_data_dir() (dirs::data_dir() + identifier), NOT Electron's
 * app.getPath("appData") (which is ~/.config on Linux).
 */
export function appDataDir(
  platform: NodeJS.Platform = process.platform,
  env: Record<string, string | undefined> = process.env,
  home: string = os.homedir()
): string {
  switch (platform) {
    case "linux":
      return path.join(env.XDG_DATA_HOME || path.join(home, ".local/share"), APP_IDENTIFIER);
    case "darwin":
      return path.join(home, "Library/Application Support", APP_IDENTIFIER);
    case "win32":
      return path.join(env.APPDATA || path.join(home, "AppData", "Roaming"), APP_IDENTIFIER);
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/** Load the numbered .sql migrations (shared with the Rust shell) in order. */
export function loadMigrations(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => fs.readFileSync(path.join(dir, name), "utf-8"));
}

/**
 * Apply pending migrations, tracked via SQLite's user_version pragma —
 * the same discipline as rusqlite_migration on the Rust side: each migration
 * runs in its own transaction with foreign keys off, followed by a
 * foreign_key_check.
 */
export function migrate(db: DatabaseSync, migrations: string[]): void {
  const { user_version: version } = db
    .prepare("PRAGMA user_version")
    .get() as { user_version: number };

  if (version > migrations.length) {
    throw new Error(
      `Database schema (user_version ${version}) is ahead of the ${migrations.length} known migrations; refusing to open`
    );
  }
  if (version === migrations.length) return;

  db.exec("PRAGMA foreign_keys = OFF");
  try {
    for (let i = version; i < migrations.length; i++) {
      db.exec("BEGIN");
      try {
        db.exec(migrations[i]);
        db.exec(`PRAGMA user_version = ${i + 1}`);
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw new Error(`Migration ${i + 1} failed: ${e instanceof Error ? e.message : e}`);
      }
    }
    const violations = db.prepare("PRAGMA foreign_key_check").all();
    if (violations.length > 0) {
      throw new Error(`Migrations left ${violations.length} foreign key violation(s)`);
    }
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}

/** Open (creating if needed) a Showbiz database with migrations applied. */
export function openDatabase(dbPath: string, migrations: string[]): DatabaseSync {
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db, migrations);
  return db;
}
