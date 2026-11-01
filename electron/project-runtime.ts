import { createGenerationModelCommands } from "./commands/generation-models";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { createDataCommands } from "./command-map";
import { createHttpCommands } from "./commands/http";
import { createSettingsCommands } from "./commands/settings";
import { createProjectDocuments } from "./project-documents";
import { createProjectDocumentCommands } from "./project-document-commands";
import type { CommandMap } from "./ipc";

export function createProjectRuntime(options: {
  appDirectory: string;
  modelDirectory: string;
  legacyDb: DatabaseSync;
  migrations: string[];
  exports: (db: DatabaseSync, media: string) => CommandMap;
  chooseOpen: () => Promise<string | null>;
  chooseSave: (name: string) => Promise<string | null>;
  canSwitch: () => boolean;
  beginSave: () => () => void;
  changed: Parameters<typeof createProjectDocumentCommands>[0]["changed"];
}) {
  const catalog = createGenerationModelCommands(options.modelDirectory);
  const deviceSettings = createSettingsCommands(options.legacyDb);
  const documents = createProjectDocuments({
    migrations: options.migrations,
    recentPath: path.join(options.appDirectory, "recent-projects.json"),
    legacy: {
      db: options.legacyDb,
      media: path.join(options.appDirectory, "media"),
    },
    bind: (db, media) =>
      createDataCommands(db, media, { exports: options.exports(db, media), readBillingKey: (provider) => deviceSettings.get_api_key({ provider }), readGenerationModels: catalog.get_generation_models }),
  });
  const globals: CommandMap = {
    ...catalog,
    ...deviceSettings,
    ...createHttpCommands(),
    ...createProjectDocumentCommands({ ...options, documents }),
  };
  return {
    documents,
    mediaDirectory: documents.mediaDirectory,
    dispose: documents.close,
    async invoke(
      command: string,
      args?: Record<string, unknown>,
    ): Promise<unknown> {
      if (globals[command]) return globals[command](args);
      if (command === "get_projects" && !documents.current()) return [];
      return documents.invoke(command, args);
    },
  };
}
