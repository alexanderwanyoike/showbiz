import { expect, it } from "vitest";
import { openTestDb } from "../db.test";
import { createGenerationUsageCommands } from "./generation-usage";

function begin(extra: Record<string, unknown> = {}) {
  const db = openTestDb();
  db.prepare("INSERT INTO projects(id,name) VALUES ('film','Film')").run();
  const commands = createGenerationUsageCommands(db);
  return {
    commands,
    begun: commands.begin_generation_usage({
      request_id: "usage-1",
      project_id: "film",
      subject_id: "asset-1",
      provider: "local",
      model_id: "local-image",
      kind: "image",
      settings: { count: 1 },
      ...extra,
    }),
  };
}

it("records which agent job started a generation", () => {
  const { commands, begun } = begin({ agent_job_id: "job-1" });
  expect(begun).toMatchObject({ ok: true, value: { agent_job_id: "job-1" } });
  expect(
    commands.get_generation_usage({ project_id: "film", limit: 10, offset: 0 }),
  ).toMatchObject({ ok: true, value: { items: [{ agent_job_id: "job-1" }] } });
});

it("leaves app-initiated generations without an agent job", () => {
  expect(begin().begun).toMatchObject({ ok: true, value: { agent_job_id: null } });
});

it("rejects a malformed agent job identity", () => {
  expect(begin({ agent_job_id: "" }).begun).toMatchObject({
    ok: false,
    error: { code: "INVALID_INPUT" },
  });
});
