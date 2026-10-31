import fs from "node:fs";
import path from "node:path";
import {
  copyProjectDocument,
  documentMediaPaths,
  DOCUMENT_APPLICATION_ID,
} from "./project-document-copy";
import { lockProjectDocument } from "./project-document-lock";
import { DatabaseSync } from "node:sqlite";
import { openDatabase } from "./db";
import { createProjectCommands } from "./commands/projects";
import { resolveMediaPath } from "./media";
import { initMediaDirs } from "./media-files";
import type { CommandMap } from "./ipc";
import type {
  DocumentResult,
  ProjectDocumentInfo,
  RecentProjectDocument,
} from "../shared/project-document";

const fail = (cause: unknown): DocumentResult<never> => ({
  ok: false,
  error: {
    code: "DOCUMENT_ERROR",
    message: cause instanceof Error ? cause.message : String(cause),
  },
});
export const projectMediaDirectory = (file: string) => `${file}.media`;

export function createProjectDocuments(options: {
  legacy?: { db: DatabaseSync; media: string };
  migrations: string[];
  recentPath: string;
  bind: (db: DatabaseSync, media: string) => CommandMap;
}) {
  let active: {
    file: string;
    db: DatabaseSync;
    commands: CommandMap;
    release: () => void;
  } | null = null;
  let busy = false;
  let recent: RecentProjectDocument[] = [];
  let warning: string | null = null;
  if (fs.existsSync(options.recentPath)) {
    try {
      const parsed: unknown = JSON.parse(
        fs.readFileSync(options.recentPath, "utf8"),
      );
      if (
        !Array.isArray(parsed) ||
        !parsed.every(
          (item: unknown) =>
            typeof item === "object" &&
            item !== null &&
            "file_path" in item &&
            typeof item.file_path === "string" &&
            "name" in item &&
            typeof item.name === "string",
        )
      )
        throw new Error("Invalid recent project list.");
      recent = parsed as RecentProjectDocument[];
    } catch (cause) {
      warning = `The recent project list could not be read. Open a project file to rebuild it. ${cause instanceof Error ? cause.message : String(cause)}`;
    }
  }

  function current(): ProjectDocumentInfo | null {
    if (!active) return null;
    const projects = createProjectCommands(
      active.db,
      projectMediaDirectory(active.file),
    ).get_projects();
    const project = projects[0];
    return {
      file_path: active.file,
      project_id: project.id,
      name: project.name,
    };
  }
  function remember(info: ProjectDocumentInfo) {
    const next = [
      { file_path: info.file_path, name: info.name },
      ...recent.filter((item) => item.file_path !== info.file_path),
    ].slice(0, 12);
    fs.mkdirSync(path.dirname(options.recentPath), { recursive: true });
    fs.writeFileSync(`${options.recentPath}.tmp`, JSON.stringify(next), {
      mode: 0o600,
    });
    fs.renameSync(`${options.recentPath}.tmp`, options.recentPath);
    recent = next;
    warning = null;
  }
  function activate(
    file: string,
    db: DatabaseSync,
    release: () => void,
  ): ProjectDocumentInfo {
    const commands = options.bind(db, projectMediaDirectory(file));
    const project = createProjectCommands(
      db,
      projectMediaDirectory(file),
    ).get_projects()[0];
    const info = {
      file_path: file,
      project_id: project.id,
      name: project.name,
    };
    remember(info);
    active?.db.close();
    active?.release();
    active = { file, db, commands, release };
    return info;
  }
  return {
    current,
    warning: () => warning,
    legacy: () =>
      options.legacy
        ? createProjectCommands(
            options.legacy.db,
            options.legacy.media,
          ).get_projects()
        : [],
    recent: () => [...recent],
    async create(
      filePath: string,
    ): Promise<DocumentResult<ProjectDocumentInfo>> {
      let db: DatabaseSync | null = null;
      let createdFile: string | null = null;
      let createdMedia = false;
      let release: (() => void) | undefined;
      try {
        const file = path.resolve(filePath);
        if (busy) throw new Error("A project file operation is in progress.");
        fs.closeSync(fs.openSync(file, "wx", 0o600));
        createdFile = file;
        release = lockProjectDocument(file);
        fs.mkdirSync(projectMediaDirectory(file));
        createdMedia = true;
        db = openDatabase(file, options.migrations);
        db.exec(`PRAGMA application_id = ${DOCUMENT_APPLICATION_ID}`);
        initMediaDirs(projectMediaDirectory(file));
        createProjectCommands(db, projectMediaDirectory(file)).create_project({
          name: path.basename(file, path.extname(file)),
        });
        const value = activate(file, db, release);
        db = null;
        return { ok: true, value };
      } catch (cause) {
        db?.close();
        release?.();
        if (createdFile) fs.rmSync(createdFile, { force: true });
        if (createdFile && createdMedia)
          fs.rmSync(projectMediaDirectory(createdFile), {
            recursive: true,
            force: true,
          });
        return fail(cause);
      }
    },
    async open(filePath: string): Promise<DocumentResult<ProjectDocumentInfo>> {
      let db: DatabaseSync | null = null;
      let release: (() => void) | undefined;
      try {
        if (busy) throw new Error("A project file operation is in progress.");
        const file = fs.realpathSync(filePath);
        if (active?.file === file) return { ok: true, value: current()! };
        db = new DatabaseSync(file, { readOnly: true });
        const header = db.prepare("PRAGMA application_id").get();
        if (header?.application_id !== DOCUMENT_APPLICATION_ID)
          throw new Error("This is not a Showbiz project document.");
        const count = db
          .prepare("SELECT COUNT(*) AS count FROM projects")
          .get();
        if (count?.count !== 1)
          throw new Error(
            "A project document must contain exactly one project.",
          );
        const media = projectMediaDirectory(file);
        for (const relative of documentMediaPaths(db)) {
          if (relative.includes("\\"))
            throw new Error("Project media paths must use forward slashes.");
          const resolved = resolveMediaPath(media, relative);
          if (!fs.existsSync(resolved))
            throw new Error(
              "Project media is missing. Keep the .showbiz file with its companion .media folder.",
            );
          const base = fs.realpathSync(media);
          if (!fs.realpathSync(resolved).startsWith(`${base}${path.sep}`))
            throw new Error(
              "Project media points outside its companion folder.",
            );
        }
        db.close();
        db = null;
        release = lockProjectDocument(file);
        db = openDatabase(file, options.migrations);
        initMediaDirs(projectMediaDirectory(file));
        const value = activate(file, db, release);
        db = null;
        return { ok: true, value };
      } catch (cause) {
        db?.close();
        release?.();
        return fail(cause);
      }
    },
    async close(): Promise<DocumentResult<null>> {
      if (busy)
        return fail(new Error("A project file operation is in progress."));
      active?.db.close();
      active?.release();
      active = null;
      return { ok: true, value: null };
    },
    async invoke(
      command: string,
      args?: Record<string, unknown>,
    ): Promise<unknown> {
      if (busy) throw new Error("A project file operation is in progress.");
      if (!active) throw new Error("Open or create a project first.");
      if (command === "create_project" || command === "delete_project")
        throw new Error(
          "Use File > New Project or Close Project to change documents.",
        );
      const handler = active.commands[command];
      if (!handler) throw new Error(`Unknown project command: ${command}`);
      return handler(args);
    },
    async saveAs(
      filePath: string,
    ): Promise<DocumentResult<ProjectDocumentInfo>> {
      if (!active || busy)
        return fail(
          new Error("Open a project and finish active file operations first."),
        );
      const file = path.resolve(filePath);
      if (file === active.file) return { ok: true, value: current()! };
      let db: DatabaseSync | null = null;
      let created = false;
      let copiedMedia = false;
      let release: (() => void) | undefined;
      busy = true;
      try {
        if (fs.existsSync(file) || fs.existsSync(projectMediaDirectory(file)))
          throw new Error(
            "Choose a new filename. Save As does not replace another project or its media.",
          );
        release = lockProjectDocument(file);
        fs.closeSync(fs.openSync(file, "wx", 0o600));
        created = true;
        active.db.prepare("VACUUM INTO ?").run(file);
        await fs.promises.cp(
          projectMediaDirectory(active.file),
          projectMediaDirectory(file),
          { recursive: true, errorOnExist: true, force: false },
        );
        copiedMedia = true;
        db = openDatabase(file, options.migrations);
        initMediaDirs(projectMediaDirectory(file));
        const value = activate(file, db, release);
        db = null;
        return { ok: true, value };
      } catch (cause) {
        db?.close();
        release?.();
        if (created) fs.rmSync(file, { force: true });
        if (created || copiedMedia)
          fs.rmSync(projectMediaDirectory(file), {
            recursive: true,
            force: true,
          });
        return fail(cause);
      } finally {
        busy = false;
      }
    },
    async importLegacy(
      projectId: string,
      filePath: string,
    ): Promise<DocumentResult<ProjectDocumentInfo>> {
      if (!options.legacy || busy)
        return fail(
          new Error("The existing project library is unavailable or busy."),
        );
      const source = options.legacy;
      if (
        !createProjectCommands(source.db, source.media).get_project({
          id: projectId,
        })
      )
        return fail(new Error("The existing project was not found."));
      const file = path.resolve(filePath);
      let db: DatabaseSync | null = null;
      let release: (() => void) | undefined;
      let created = false;
      busy = true;
      try {
        if (fs.existsSync(file) || fs.existsSync(projectMediaDirectory(file)))
          throw new Error("Choose a new filename for the converted project.");
        release = lockProjectDocument(file);
        fs.closeSync(fs.openSync(file, "wx", 0o600));
        created = true;
        db = await copyProjectDocument({
          source: source.db,
          sourceMedia: source.media,
          file,
          media: projectMediaDirectory(file),
          migrations: options.migrations,
          projectId,
        });
        const value = activate(file, db, release);
        db = null;
        return { ok: true, value };
      } catch (cause) {
        db?.close();
        release?.();
        if (created) {
          fs.rmSync(file, { force: true });
          fs.rmSync(projectMediaDirectory(file), {
            recursive: true,
            force: true,
          });
        }
        return fail(cause);
      } finally {
        busy = false;
      }
    },
    mediaDirectory: () => (active ? projectMediaDirectory(active.file) : null),
  };
}
