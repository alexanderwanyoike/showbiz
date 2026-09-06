import type { DatabaseSync } from "node:sqlite";
import type { createExportCommands } from "./commands/export";
import { createProjectCommands } from "./commands/projects";
import { createShotCommands } from "./commands/shots";
import { createHttpCommands } from "./commands/http";
import { createMediaCommands } from "./commands/media";
import { createSettingsCommands } from "./commands/settings";
import { createTimelineCommands } from "./commands/timeline";
import { createBibleCommands } from "./commands/bibles";
import { createImageVersionCommands } from "./commands/image-versions";
import { createVideoVersionCommands } from "./commands/video-versions";

export function createDataCommands(
  db: DatabaseSync,
  mediaDir: string,
  exportCommands: ReturnType<typeof createExportCommands>,
) {
  return {
    ...createProjectCommands(db, mediaDir),
    ...createShotCommands(db, mediaDir),
    ...createMediaCommands(mediaDir),
    ...createSettingsCommands(db),
    ...createHttpCommands(),
    ...createTimelineCommands(db),
    ...createBibleCommands(db, mediaDir),
    ...createImageVersionCommands(db, mediaDir),
    ...createVideoVersionCommands(db, mediaDir),
    ...exportCommands,
  };
}
