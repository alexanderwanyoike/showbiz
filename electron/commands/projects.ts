import type { DatabaseSync } from "node:sqlite";

export interface Project {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

/** Ported project commands; names and JSON shapes match src-tauri/src/commands/projects.rs. */
export function createProjectCommands(db: DatabaseSync) {
  return {
    get_projects(): Project[] {
      return db
        .prepare(
          "SELECT id, name, created_at, updated_at FROM projects ORDER BY updated_at DESC"
        )
        .all() as unknown as Project[];
    },
  };
}
