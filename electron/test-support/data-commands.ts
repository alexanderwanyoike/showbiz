import { fileURLToPath } from "node:url";
import type { DatabaseSync } from "node:sqlite";
import type { CommandMap } from "../ipc";
import { createDataCommands } from "../command-map";
import { createShotCommands } from "../commands/shots";
import { createGenerationModelCommands } from "../commands/generation-models";

export const testCatalog = createGenerationModelCommands(fileURLToPath(new URL("../../src/lib/models/providers", import.meta.url)));
export const testDataOptions = { readBillingKey: () => null, readGenerationModels: testCatalog.get_generation_models };
export function createTestDataCommands(db: DatabaseSync, media: string, exports: CommandMap = {}) {
  return createDataCommands(db, media, { ...testDataOptions, exports });
}
export function createTestShotCommands(db: DatabaseSync, media: string) {
  return createShotCommands(db, media, testCatalog.get_generation_models);
}
