import path from "node:path";
import { expect, it } from "vitest";
import { openTestDb } from "../db.test";
import { createAgentBudgetCommands } from "../commands/agent-budget";
import { createGenerationModelCommands } from "../commands/generation-models";
import { createAgentJobLedger } from "./job-ledger";
import { createAgentGenerationRuntime } from "./runtime";

function setup() {
  const db = openTestDb();
  const budget = createAgentBudgetCommands(db, {
    readModels: createGenerationModelCommands(path.resolve("src/lib/models/providers")).get_generation_models,
  });
  const granted = budget.grant_agent_budget({ max_microusd: 100_000, duration_minutes: 60 });
  if (!granted.ok) throw new Error("expected grant");
  const sent: { operation: string; request_id: string }[] = [];
  const runtime = createAgentGenerationRuntime({
    window: () => ({
      id: 1,
      send: (_channel, payload) => sent.push(payload as (typeof sent)[number]),
    }),
    budget: async () => budget.get_agent_budget(),
    deviceDb: db,
    invoke: async (command) =>
      command === "get_project_document_state"
        ? { ok: true, value: { current: { project_id: "film" } } }
        : { ok: true, value: { items: [{ request_id: "u1", reported_microusd: 150_000 }], total_count: 1 } },
    canEdit: () => true,
  });
  const ledger = createAgentJobLedger(db);
  ledger.insert({
    job_id: "job-1", request_id: "r1", quote_id: "q1", grant_id: granted.value.id,
    project_id: "film", subject_id: "asset-1", usage_request_id: "u1",
    model_id: "flux-dev-fal", kind: "image", reserved_microusd: 25_000,
  });
  return { runtime, ledger, sent };
}

it("reads charges confirmed after a job finished before reporting the budget", async () => {
  const { runtime, ledger } = setup();
  ledger.update("job-1", { status: "completed", provider_called: true });
  expect(await runtime.commands.get_agent_budget()).toMatchObject({
    ok: true,
    value: { committed_microusd: 150_000, frozen: true },
  });
});

it("interrupts unfinished jobs when the app window goes away", () => {
  const { runtime, ledger } = setup();
  runtime.abandon(1);
  expect(ledger.get("job-1")?.status).toBe("interrupted");
});

it("accepts job reports only from the app window", async () => {
  const { runtime, ledger } = setup();
  await runtime.report(2, { job_id: "job-1", status: "running" });
  expect(ledger.get("job-1")?.status).toBe("accepted");
  await runtime.report(1, { job_id: "job-1", status: "running" });
  expect(ledger.get("job-1")?.status).toBe("running");
});

it("asks the app window to add a Bible picture", async () => {
  const { runtime, sent } = setup();
  const answer = runtime.commands.add_bible_image({ bible_asset_id: "sock", mime_type: "image/png", base64: "iVBORw0KGgo=" });
  expect(sent).toMatchObject([{ operation: "add_bible_image", input: { bible_asset_id: "sock" } }]);
  runtime.respond(1, sent[0].request_id, { ok: true, value: { variant_id: "v1" } });
  expect(await answer).toEqual({ ok: true, value: { variant_id: "v1" } });
});
