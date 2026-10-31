import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { createDataCommands } from "./command-map";
import { createHttpCommands } from "./commands/http";
import { createSettingsCommands } from "./commands/settings";
import { createProjectDocuments } from "./project-documents";
import { createProjectDocumentCommands } from "./project-document-commands";
import type { CommandMap } from "./ipc";

export function createProjectRuntime(options: {
  appDirectory: string; legacyDb: DatabaseSync; migrations: string[];
  exports: (db: DatabaseSync, media: string) => CommandMap;
  chooseOpen: () => Promise<string | null>;
  chooseSave: (name: string) => Promise<string | null>;
  canSwitch: () => boolean;
  beginSave: () => () => void;
  changed: Parameters<typeof createProjectDocumentCommands>[0]["changed"];
}) {
  const documents = createProjectDocuments({
    migrations: options.migrations,
    recentPath: path.join(options.appDirectory, "recent-projects.json"),
    legacy: { db: options.legacyDb, media: path.join(options.appDirectory, "media") },
    bind: (db, media) => createDataCommands(db, media, options.exports(db, media)),
  });
  const globals: CommandMap = { ...createSettingsCommands(options.legacyDb), ...createHttpCommands(), ...createProjectDocumentCommands({ ...options, documents }) };
  return {
    documents,
    mediaDirectory: documents.mediaDirectory,
    dispose: documents.close,
    async invoke(command: string, args?: Record<string, unknown>): Promise<unknown> {
      if (globals[command]) return globals[command](args);
      if (command === "get_projects" && !documents.current()) return [];
      return documents.invoke(command, args);
    },
  };
}
