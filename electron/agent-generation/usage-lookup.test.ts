import { expect, it } from "vitest";
import { openTestDb } from "../db.test";
import { createGenerationUsageCommands } from "../commands/generation-usage";
import { findAgentJobUsage } from "./usage-lookup";

function documentWith(openProject: string | null, rows = 0) {
  const db = openTestDb();
  db.prepare("INSERT INTO projects(id,name) VALUES ('film','Film')").run();
  const usage = createGenerationUsageCommands(db);
  for (let index = 0; index < rows; index++)
    usage.begin_generation_usage({
      request_id: `other-${index}`,
      project_id: "film",
      subject_id: "asset-1",
      provider: "fal",
      model_id: "flux-dev-fal",
      kind: "image",
    });
  const commands: Record<string, (args?: Record<string, unknown>) => unknown> = {
    ...usage,
    get_project_document_state: () => ({
      ok: true,
      value: { current: openProject ? { project_id: openProject } : null, recent: [] },
    }),
  };
  return {
    usage,
    invoke: async (command: string, args?: Record<string, unknown>) => commands[command]?.(args),
  };
}
const job = { project_id: "film", subject_id: "asset-1", usage_request_id: "usage-1" };

it("finds the job's usage record and its confirmed charge, past the first page", async () => {
  const film = documentWith("film", 120);
  film.usage.begin_generation_usage({
    request_id: "usage-1",
    project_id: "film",
    subject_id: "asset-1",
    provider: "fal",
    model_id: "flux-dev-fal",
    kind: "image",
  });
  film.usage.record_generation_receipt({ request_id: "usage-1", reported_microusd: 21_000, provider_request_id: "p1" });
  expect(await findAgentJobUsage(film.invoke, job)).toEqual({ reported_microusd: 21_000 });
});

it("knows a usage record was never started when the job's project is open", async () => {
  expect(await findAgentJobUsage(documentWith("film", 3).invoke, job)).toBeNull();
});

it("cannot tell when the job's project is not the open one", async () => {
  expect(await findAgentJobUsage(documentWith("another").invoke, job)).toBeUndefined();
  expect(await findAgentJobUsage(documentWith(null).invoke, job)).toBeUndefined();
});
