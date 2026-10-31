import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openDatabase } from "./db";
import { createProjectCommands } from "./commands/projects";
import { initMediaDirs } from "./media-files";
import type { CommandMap } from "./ipc";
import type { DocumentResult, ProjectDocumentInfo, RecentProjectDocument } from "../shared/project-document";

const APPLICATION_ID = 0x53425a44;
const fail = (cause: unknown): DocumentResult<never> => ({ ok: false, error: { code: "DOCUMENT_ERROR", message: cause instanceof Error ? cause.message : String(cause) } });
export const projectMediaDirectory = (file: string) => `${file}.media`;

export function createProjectDocuments(options: {
  migrations: string[];
  recentPath: string;
  bind: (db: DatabaseSync, media: string) => CommandMap;
}) {
  let active: { file: string; db: DatabaseSync; commands: CommandMap } | null = null;
  let recent: RecentProjectDocument[] = [];
  if (fs.existsSync(options.recentPath)) {
    const parsed: unknown = JSON.parse(fs.readFileSync(options.recentPath, "utf8"));
    if (!Array.isArray(parsed) || !parsed.every((item: unknown) => typeof item === "object" && item !== null && "file_path" in item && typeof item.file_path === "string" && "name" in item && typeof item.name === "string")) throw new Error("The recent project list is invalid.");
    recent = parsed as RecentProjectDocument[];
  }
  function current(): ProjectDocumentInfo | null {
    if (!active) return null;
    const projects = createProjectCommands(active.db, projectMediaDirectory(active.file)).get_projects();
    const project = projects[0];
    return { file_path: active.file, project_id: project.id, name: project.name };
  }
  function remember(info: ProjectDocumentInfo) {
    const next = [{ file_path: info.file_path, name: info.name }, ...recent.filter((item) => item.file_path !== info.file_path)].slice(0, 12);
    fs.mkdirSync(path.dirname(options.recentPath), { recursive: true });
    fs.writeFileSync(`${options.recentPath}.tmp`, JSON.stringify(next), { mode: 0o600 });
    fs.renameSync(`${options.recentPath}.tmp`, options.recentPath);
    recent = next;
  }
  function activate(file: string, db: DatabaseSync): ProjectDocumentInfo {
    const commands = options.bind(db, projectMediaDirectory(file));
    const project = createProjectCommands(db, projectMediaDirectory(file)).get_projects()[0];
    const info = { file_path: file, project_id: project.id, name: project.name };
    remember(info);
    active?.db.close();
    active = { file, db, commands };
    return info;
  }
  return {
    current,
    recent: () => [...recent],
    async create(filePath: string): Promise<DocumentResult<ProjectDocumentInfo>> {
      let db: DatabaseSync | null = null;
      let createdFile: string | null = null;
      let createdMedia = false;
      try {
        const file = path.resolve(filePath);
        fs.closeSync(fs.openSync(file, "wx"));
        createdFile = file;
        fs.mkdirSync(projectMediaDirectory(file));
        createdMedia = true;
        db = openDatabase(file, options.migrations);
        db.exec(`PRAGMA application_id = ${APPLICATION_ID}`);
        initMediaDirs(projectMediaDirectory(file));
        createProjectCommands(db, projectMediaDirectory(file)).create_project({ name: path.basename(file, path.extname(file)) });
        const value = activate(file, db);
        db = null;
        return { ok: true, value };
      } catch (cause) {
        db?.close();
        if (createdFile) fs.rmSync(createdFile, { force: true });
        if (createdFile && createdMedia) fs.rmSync(projectMediaDirectory(createdFile), { recursive: true, force: true });
        return fail(cause);
      }
    },
    async open(filePath: string): Promise<DocumentResult<ProjectDocumentInfo>> {
      let db: DatabaseSync | null = null;
      try {
        const file = fs.realpathSync(filePath);
        db = new DatabaseSync(file, { readOnly: true });
        const header = db.prepare("PRAGMA application_id").get();
        if (header?.application_id !== APPLICATION_ID) throw new Error("This is not a Showbiz project document.");
        const count = db.prepare("SELECT COUNT(*) AS count FROM projects").get();
        if (count?.count !== 1) throw new Error("A project document must contain exactly one project.");
        db.close();
        db = openDatabase(file, options.migrations);
        const value = activate(file, db);
        db = null;
        return { ok: true, value };
      } catch (cause) { db?.close(); return fail(cause); }
    },
    async close(): Promise<DocumentResult<null>> {
      active?.db.close(); active = null;
      return { ok: true, value: null };
    },
    async invoke(command: string, args?: Record<string, unknown>): Promise<unknown> {
      if (!active) throw new Error("Open or create a project first.");
      if (command === "create_project" || command === "delete_project") throw new Error("Use File > New Project or Close Project to change documents.");
      const handler = active.commands[command];
      if (!handler) throw new Error(`Unknown project command: ${command}`);
      return handler(args);
    },
    mediaDirectory: () => active ? projectMediaDirectory(active.file) : null,
  };
}
