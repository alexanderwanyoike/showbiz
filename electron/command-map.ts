import { createGenerationUsageCommands } from "./commands/generation-usage";
import type { DatabaseSync } from "node:sqlite";
import type { CommandMap } from "./ipc";
import { createProjectCommands } from "./commands/projects";
import { createShotCommands } from "./commands/shots";
import { createHttpCommands } from "./commands/http";
import { createMediaCommands } from "./commands/media";
import { createSettingsCommands } from "./commands/settings";
import { createBibleCommands } from "./commands/bibles";
import { createImageVersionCommands } from "./commands/image-versions";
import { createVideoVersionCommands } from "./commands/video-versions";

export function createDataCommands(
  db: DatabaseSync,
  mediaDir: string,
  exportCommands: CommandMap = {},
) {
  return {
    ...createProjectCommands(db, mediaDir),
    ...createGenerationUsageCommands(db),
    ...createShotCommands(db, mediaDir),
    ...createMediaCommands(mediaDir),
    ...createSettingsCommands(db),
    ...createHttpCommands(),
    ...createBibleCommands(db, mediaDir),
    ...createImageVersionCommands(db, mediaDir),
    ...createVideoVersionCommands(db, mediaDir),
    ...exportCommands,
  };
}
