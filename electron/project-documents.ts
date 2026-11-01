import { commandWorkKind, commandIsDocumentScoped } from "../shared/command-effects";
import { createProjectCache } from "./project-cache";
import { recoverInterruptedGenerationUsage } from "./commands/generation-usage";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  copyProjectDocument,
  documentMediaPaths,
  DOCUMENT_APPLICATION_ID,
} from "./project-document-copy";
import { lockProjectDocument } from "./project-document-lock";
import { createDocumentMedia } from "./project-document-media";
import { openDatabase } from "./db";
import { createProjectCommands } from "./commands/projects";
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
type ActiveDocument = {
  file: string;
  readOnly: boolean;
  db: DatabaseSync;
  media: string;
  archive: ReturnType<typeof createDocumentMedia>;
  commands: CommandMap;
  release: () => void;
};
export function createProjectDocuments(options: {
  legacy?: { db: DatabaseSync; media: string };
  migrations: string[];
  recentPath: string;
  bind: (db: DatabaseSync, media: string) => CommandMap;
}) {
  let active: ActiveDocument | null = null;
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

  function info(document: ActiveDocument): ProjectDocumentInfo {
    const project = createProjectCommands(
      document.db,
      document.media,
    ).get_projects()[0];
    return {
      file_path: document.file,
      read_only: document.readOnly,
      project_id: project.id,
      name: project.name,
    };
  }
  function current() {
    return active ? info(active) : null;
  }
  function remember(value: ProjectDocumentInfo) {
    const next = [
      { file_path: value.file_path, name: value.name },
      ...recent.filter((item) => item.file_path !== value.file_path),
    ].slice(0, 12);
    fs.mkdirSync(path.dirname(options.recentPath), { recursive: true });
    fs.writeFileSync(`${options.recentPath}.tmp`, JSON.stringify(next), {
      mode: 0o600,
    });
    fs.renameSync(`${options.recentPath}.tmp`, options.recentPath);
    recent = next;
    warning = null;
  }
  const cache = createProjectCache(
    path.join(path.dirname(options.recentPath), "project-cache"),
  );
  const recovered = cache.sweep();
  if (!recovered.ok)
    warning = [warning, recovered.error.message].filter(Boolean).join("\n");
  const workspace = cache.create;
  function dispose(document: ActiveDocument) {
    document.db.close();
    document.release();
    cache.remove(document.media);
  }
  function activate(document: ActiveDocument) {
    const value = info(document);
    remember(value);
    if (active) dispose(active);
    active = document;
    return value;
  }
  function prepare(
    file: string,
    db: DatabaseSync,
    media: string,
    release: () => void,
    readOnly = false,
  ) {
    const archive = createDocumentMedia(db, media);
    return {
      file,
      readOnly,
      db,
      media,
      release,
      archive,
      commands: options.bind(db, media),
    };
  }
  function persist<T>(
    document: Pick<ActiveDocument, "db" | "archive">,
    operation: () => T,
  ): T {
    document.db.exec("SAVEPOINT document_save");
    try {
      const value = operation();
      document.archive.sync();
      const embedded = new Set(
        document.db
          .prepare("SELECT path FROM document_files")
          .all()
          .map((row) => row.path),
      );
      if (
        documentMediaPaths(document.db).some(
          (relative) => !embedded.has(relative),
        )
      )
        throw new Error(
          "A referenced media file could not be included in the project.",
        );
      document.db.exec("RELEASE document_save");
      return value;
    } catch (cause) {
      document.db.exec("ROLLBACK TO document_save; RELEASE document_save");
      document.archive.restore();
      throw cause;
    }
  }
  function destination(filePath: string): DocumentResult<string> {
    try {
      const absolute = path.resolve(filePath);
      const file = fs.existsSync(absolute)
        ? fs.realpathSync(absolute)
        : path.join(
            fs.realpathSync(path.dirname(absolute)),
            path.basename(absolute),
          );
      return { ok: true, value: file };
    } catch (cause) {
      return fail(cause);
    }
  }
  async function writeDocument(
    file: string,
    populate: (
      temporary: string,
      media: string,
    ) => DatabaseSync | Promise<DatabaseSync>,
    restoreMedia = false,
  ): Promise<DocumentResult<ProjectDocumentInfo>> {
    const temporary = `${file}.${randomUUID()}.tmp`;
    const backup = `${file}.${randomUUID()}.previous`;
    let db: DatabaseSync | null = null;
    let media: string | null = null;
    let release: (() => void) | undefined;
    let hasBackup = false;
    let published = false;
    busy = true;
    try {
      release = lockProjectDocument(file);
      fs.closeSync(fs.openSync(temporary, "wx", 0o600));
      media = workspace();
      initMediaDirs(media);
      db = await populate(temporary, media);
      const archive = createDocumentMedia(db, media);
      if (restoreMedia) archive.restore();
      persist({ db, archive }, () => {});
      db.close();
      db = null;
      if (fs.existsSync(file)) {
        try {
          fs.linkSync(file, backup);
        } catch (cause) {
          if (
            !(cause instanceof Error) ||
            !("code" in cause) ||
            !["EXDEV", "EPERM", "ENOTSUP", "EOPNOTSUPP", "EMLINK"].includes(
              String(cause.code),
            )
          )
            throw cause;
          fs.copyFileSync(
            file,
            backup,
            fs.constants.COPYFILE_EXCL | fs.constants.COPYFILE_FICLONE,
          );
        }
        hasBackup = true;
      }
      fs.renameSync(temporary, file);
      published = true;
      db = openDatabase(file, options.migrations);
      const document = prepare(file, db, media, release);
      const value = activate(document);
      db = null;
      if (hasBackup) {
        try {
          fs.unlinkSync(backup);
        } catch (cause) {
          warning = `The project was saved, but its previous copy could not be removed at ${backup}: ${cause instanceof Error ? cause.message : String(cause)}`;
        }
      }
      return { ok: true, value };
    } catch (cause) {
      const errors = [cause instanceof Error ? cause.message : String(cause)];
      const cleanup = [
        () => db?.close(),
        () => {
          if (published && hasBackup) fs.renameSync(backup, file);
          else if (published) fs.rmSync(file, { force: true });
          else if (hasBackup) fs.rmSync(backup, { force: true });
        },
        () => fs.rmSync(temporary, { force: true }),
        () => release?.(),
        () => {
          if (media) cache.remove(media);
        },
      ];
      for (const action of cleanup) {
        try {
          action();
        } catch (error) {
          errors.push(
            `Recovery: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      return fail(new Error(errors.join("\n")));
    } finally {
      busy = false;
    }
  }
  const documents = {
    current,
    warning: () => warning,
    recent: () => [...recent],
    legacy: () =>
      options.legacy
        ? createProjectCommands(
            options.legacy.db,
            options.legacy.media,
          ).get_projects()
        : [],
    async create(
      filePath: string,
    ): Promise<DocumentResult<ProjectDocumentInfo>> {
      if (busy)
        return fail(new Error("A project file operation is in progress."));
      const resolved = destination(filePath);
      if (!resolved.ok) return resolved;
      const file = resolved.value;
      return writeDocument(file, (temporary, media) => {
        const db = openDatabase(temporary, options.migrations);
        try {
          db.exec(`PRAGMA application_id=${DOCUMENT_APPLICATION_ID}`);
          createProjectCommands(db, media).create_project({
            name: path.basename(file, path.extname(file)),
          });
          return db;
        } catch (cause) {
          db.close();
          throw cause;
        }
      });
    },
    async open(filePath: string): Promise<DocumentResult<ProjectDocumentInfo>> {
      let db: DatabaseSync | null = null;
      let media: string | null = null;
      let release: (() => void) | undefined;
      try {
        if (busy) throw new Error("A project file operation is in progress.");
        const file = fs.realpathSync(filePath);
        if (active?.file === file) return { ok: true, value: current()! };
        db = new DatabaseSync(file, { readOnly: true });
        if (
          db.prepare("PRAGMA application_id").get()?.application_id !==
          DOCUMENT_APPLICATION_ID
        )
          throw new Error("This is not a Showbiz project package.");
        if (
          db.prepare("SELECT COUNT(*) AS count FROM projects").get()?.count !==
          1
        )
          throw new Error(
            "A project package must contain exactly one project.",
          );
        if (
          db
            .prepare(
              "SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('document_files','document_file_chunks')",
            )
            .get()?.count !== 2
        )
          throw new Error(
            "This project is not a self-contained Showbiz package.",
          );
        db.close();
        db = null;
        let readOnly = false;
        try {
          fs.accessSync(file, fs.constants.W_OK);
          fs.accessSync(path.dirname(file), fs.constants.W_OK);
        } catch (cause) {
          if (
            !(cause instanceof Error) ||
            !("code" in cause) ||
            !["EACCES", "EROFS"].includes(String(cause.code))
          )
            throw cause;
          readOnly = true;
        }
        if (!readOnly) {
          try { release = lockProjectDocument(file); }
          catch (cause) {
            if (!(cause instanceof Error) || !("code" in cause) || !["EACCES", "EROFS", "EPERM"].includes(String(cause.code))) throw cause;
            readOnly = true;
          }
        }
        if (readOnly) {
          db = new DatabaseSync(file, { readOnly: true });
          db.exec("PRAGMA foreign_keys=ON");
          if (
            db.prepare("PRAGMA user_version").get()?.user_version !==
            options.migrations.length
          )
            throw new Error(
              "This read-only project needs a schema update. Copy it to a writable folder, then open the copy.",
            );
          release = () => {};
        } else {
          db = openDatabase(file, options.migrations);
        }
        media = workspace();
        const document = prepare(file, db, media, release, readOnly);
        document.archive.restore();
        const embedded = new Set(
          db
            .prepare("SELECT path FROM document_files")
            .all()
            .map((row) => row.path),
        );
        if (documentMediaPaths(db).some((relative) => !embedded.has(relative)))
          throw new Error("The project is missing embedded media.");
        db.exec("SAVEPOINT document_open");
        let value: ProjectDocumentInfo;
        try {
          if (!readOnly) recoverInterruptedGenerationUsage(db);
          value = activate(document);
          db.exec("RELEASE document_open");
        } catch (cause) {
          db.exec("ROLLBACK TO document_open; RELEASE document_open");
          throw cause;
        }
        db = null;
        return { ok: true, value };
      } catch (cause) {
        db?.close();
        release?.();
        if (media) cache.remove(media);
        return fail(cause);
      }
    },
    async save(): Promise<DocumentResult<ProjectDocumentInfo>> {
      if (!active || busy)
        return fail(
          new Error("Open a project and finish active file operations first."),
        );
      try {
        if (active.readOnly)
          return fail(
            new Error(
              "This project is read-only. Use Save As to create an editable copy.",
            ),
          );
        persist(active, () => {});
        return { ok: true, value: current()! };
      } catch (cause) {
        return fail(cause);
      }
    },
    async close(): Promise<DocumentResult<null>> {
      if (busy)
        return fail(new Error("A project file operation is in progress."));
      try {
        if (active) {
          if (!active.readOnly) persist(active, () => {});
          dispose(active);
          active = null;
        }
        return { ok: true, value: null };
      } catch (cause) {
        return fail(cause);
      }
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
      if (!commandIsDocumentScoped(command)) throw new Error(`Unclassified project command: ${command}`);
      if (commandWorkKind(command) !== "saving") return handler(args);
      if (active.readOnly)
        throw new Error(
          "This project is read-only. Use Save As to create an editable copy.",
        );
      return persist(active, () => handler(args));
    },
    async saveAs(
      filePath: string,
    ): Promise<DocumentResult<ProjectDocumentInfo>> {
      if (!active || busy)
        return fail(
          new Error("Open a project and finish active file operations first."),
        );
      const resolved = destination(filePath);
      if (!resolved.ok) return resolved;
      const file = resolved.value;
      if (file === active.file) return documents.save();
      const source = active;
      try {
        if (!source.readOnly) persist(source, () => {});
      } catch (cause) {
        return fail(cause);
      }
      return writeDocument(
        file,
        (temporary) => {
          source.db.prepare("VACUUM INTO ?").run(temporary);
          return openDatabase(temporary, options.migrations);
        },
        true,
      );
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
      const resolved = destination(filePath);
      if (!resolved.ok) return resolved;
      const file = resolved.value;
      return writeDocument(file, (temporary, media) =>
        copyProjectDocument({
          source: source.db,
          sourceMedia: source.media,
          file: temporary,
          media,
          migrations: options.migrations,
          projectId,
        }),
      );
    },
    mediaDirectory: () => active?.media ?? null,
  };
  return documents;
}
