import { createGenerationBillingCommands } from "./commands/generation-billing";
import { createStoryboardSettingsCommands } from "./commands/storyboard-settings";
import type { ReadGenerationModels } from "./commands/generation-models";
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
  options: {
    exports?: CommandMap;
    readBillingKey: (provider: string) => string | null;
    readGenerationModels: ReadGenerationModels;
  },
) {
  return {
    ...createProjectCommands(db, mediaDir, options.readGenerationModels),
    ...createStoryboardSettingsCommands(db, options.readGenerationModels),
    ...createGenerationUsageCommands(db),
    ...createGenerationBillingCommands(db, options.readBillingKey),
    ...createShotCommands(db, mediaDir, options.readGenerationModels),
    ...createMediaCommands(mediaDir),
    ...createSettingsCommands(db),
    ...createHttpCommands(),
    ...createBibleCommands(db, mediaDir),
    ...createImageVersionCommands(db, mediaDir),
    ...createVideoVersionCommands(db, mediaDir),
    ...options.exports,
  };
}
