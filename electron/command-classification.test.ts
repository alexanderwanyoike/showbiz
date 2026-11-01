import { expect, it } from "vitest";
import { commandIsDocumentScoped } from "../shared/command-effects";
import { openTestDb } from "./db.test";
import { createTestDataCommands } from "./test-support/data-commands";

it("classifies every document handler explicitly before it can be dispatched", () => {
  const db = openTestDb();
  try {
    const commands = createTestDataCommands(db, "/unused");
    expect(
      Object.keys(commands).filter(
        (command) => !commandIsDocumentScoped(command),
      ),
    ).toEqual([]);
  } finally {
    db.close();
  }
});
