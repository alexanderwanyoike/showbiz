import { db } from "../db";

export interface Project {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export function getAllProjects(): Project[] {
  const stmt = db.prepare("SELECT * FROM projects ORDER BY updated_at DESC");
  return stmt.all() as Project[];
}

export function getProjectById(id: string): Project | null {
  const stmt = db.prepare("SELECT * FROM projects WHERE id = ?");
  return (stmt.get(id) as Project) || null;
}

export function createProject(id: string, name: string): Project {
  const stmt = db.prepare(
    "INSERT INTO projects (id, name) VALUES (?, ?) RETURNING *"
  );
  return stmt.get(id, name) as Project;
}

export function updateProject(id: string, name: string): Project | null {
  const stmt = db.prepare(
    "UPDATE projects SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *"
  );
  return (stmt.get(name, id) as Project) || null;
}

export function deleteProject(id: string): boolean {
  const stmt = db.prepare("DELETE FROM projects WHERE id = ?");
  const result = stmt.run(id);
  return result.changes > 0;
}
