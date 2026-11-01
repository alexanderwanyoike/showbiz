export type DocumentResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string } };

export interface ProjectDocumentInfo {
  read_only: boolean;
  file_path: string;
  project_id: string;
  name: string;
}
export interface RecentProjectDocument {
  file_path: string;
  name: string;
}
export interface ProjectDocumentState {
  warning?: string | null;
  current: ProjectDocumentInfo | null;
  recent: RecentProjectDocument[];
  legacy: { id: string; name: string }[];
}
