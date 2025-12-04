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

    CREATE TABLE IF NOT EXISTS image_versions (
      id TEXT PRIMARY KEY,
      shot_id TEXT NOT NULL REFERENCES shots(id) ON DELETE CASCADE,
      parent_version_id TEXT REFERENCES image_versions(id) ON DELETE SET NULL,
      version_number INTEGER NOT NULL,
      edit_type TEXT NOT NULL CHECK(edit_type IN ('generation', 'regeneration', 'remix', 'inpaint')),
      image_path TEXT NOT NULL,
      prompt TEXT,
      edit_prompt TEXT,
      mask_path TEXT,
      is_current INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_image_versions_shot ON image_versions(shot_id);
    CREATE INDEX IF NOT EXISTS idx_image_versions_parent ON image_versions(parent_version_id);
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

  // Migration: Create initial image versions for existing shots with images
  const shotsWithImages = db
    .prepare(
      `SELECT s.id, s.image_path, s.image_prompt
       FROM shots s
       LEFT JOIN image_versions iv ON s.id = iv.shot_id
       WHERE s.image_path IS NOT NULL AND iv.id IS NULL`
    )
    .all() as { id: string; image_path: string; image_prompt: string | null }[];

  if (shotsWithImages.length > 0) {
    const insertVersion = db.prepare(`
      INSERT INTO image_versions (id, shot_id, parent_version_id, version_number, edit_type, image_path, prompt, is_current)
      VALUES (?, ?, NULL, 1, 'generation', ?, ?, 1)
    `);

    for (const shot of shotsWithImages) {
      const versionId = `imgver-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      insertVersion.run(versionId, shot.id, shot.image_path, shot.image_prompt);
    }
  }
}

// Run migrations on module load
migrate();

export { db };
