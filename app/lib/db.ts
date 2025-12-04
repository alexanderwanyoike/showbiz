import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// Database file location
const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "showbiz.db");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize database connection
const db = new Database(DB_PATH);

// Enable foreign keys
db.pragma("foreign_keys = ON");

// Run migrations
function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS storyboards (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      image_model TEXT NOT NULL DEFAULT 'imagen4',
      video_model TEXT NOT NULL DEFAULT 'veo3',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS shots (
      id TEXT PRIMARY KEY,
      storyboard_id TEXT NOT NULL REFERENCES storyboards(id) ON DELETE CASCADE,
      "order" INTEGER NOT NULL,
      duration INTEGER NOT NULL DEFAULT 8,
      image_prompt TEXT,
      image_path TEXT,
      video_prompt TEXT,
      video_path TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_storyboards_project ON storyboards(project_id);
    CREATE INDEX IF NOT EXISTS idx_shots_storyboard ON shots(storyboard_id);

    CREATE TABLE IF NOT EXISTS timeline_edits (
      id TEXT PRIMARY KEY,
      storyboard_id TEXT NOT NULL REFERENCES storyboards(id) ON DELETE CASCADE,
      shot_id TEXT NOT NULL REFERENCES shots(id) ON DELETE CASCADE,
      trim_in REAL NOT NULL DEFAULT 0,
      trim_out REAL NOT NULL DEFAULT 8,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(storyboard_id, shot_id)
    );

    CREATE INDEX IF NOT EXISTS idx_timeline_edits_storyboard ON timeline_edits(storyboard_id);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migration: Add model columns to existing storyboards table
  const tableInfo = db.prepare("PRAGMA table_info(storyboards)").all() as { name: string }[];
  const columns = tableInfo.map((col) => col.name);

  if (!columns.includes("image_model")) {
    db.exec(`ALTER TABLE storyboards ADD COLUMN image_model TEXT NOT NULL DEFAULT 'imagen4'`);
  }
  if (!columns.includes("video_model")) {
    db.exec(`ALTER TABLE storyboards ADD COLUMN video_model TEXT NOT NULL DEFAULT 'veo3'`);
  }
}

// Run migrations on module load
migrate();

export { db };
