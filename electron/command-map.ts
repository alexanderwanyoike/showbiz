import { createGenerationBillingCommands } from "./commands/generation-billing";
import { createStoryboardSettingsCommands } from "./commands/storyboard-settings";
import path from "node:path";
import { createGenerationModelCommands } from "./commands/generation-models";
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
  readBillingKey?: (provider: string) => string | null,
) {
  return {
    ...createProjectCommands(db, mediaDir),
    ...createStoryboardSettingsCommands(db),
    ...createGenerationUsageCommands(db),
    ...createGenerationBillingCommands(db, readBillingKey ?? ((provider) => createSettingsCommands(db).get_api_key({ provider }))),
    ...createGenerationModelCommands(path.resolve("src/lib/models/providers")),
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
