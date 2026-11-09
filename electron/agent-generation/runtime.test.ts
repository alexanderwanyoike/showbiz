import { expect, it } from "vitest";
import { openTestDb } from "../db.test";
import { createAgentJobLedger } from "./job-ledger";
import { createAgentGenerationRuntime } from "./runtime";

function setup() {
  const db = openTestDb();
  const sent: { operation: string; request_id: string; input: unknown }[] = [];
  const runtime = createAgentGenerationRuntime({
    window: () => ({
      id: 1,
      send: (_channel, payload) => sent.push(payload as (typeof sent)[number]),
    }),
    deviceDb: db,
    invoke: async () => ({ ok: true, value: { items: [], total_count: 0 } }),
    canEdit: () => true,
  });
  const ledger = createAgentJobLedger(db);
  ledger.insert({
    job_id: "job-1", request_id: "r1", request_fingerprint: "f1",
    project_id: "film", subject_id: "asset-1", usage_request_id: "u1",
    model_id: "flux-dev-fal", kind: "image", estimate: null,
  });
  return { runtime, ledger, sent };
}

it("generates by asking the app window for a plan and then starting the job, with no budget", async () => {
  const { runtime, ledger, sent } = setup();
  ledger.update("job-1", { status: "completed", provider_called: true });
  const request = {
    target: "bible_asset",
    operation: "generate",
    asset_id: "asset-1",
    prompt: "A sock puppet detective",
    model_id: "flux-kontext-fal",
  };
  const job = runtime.commands.generate({ ...request, request_id: "r2" });
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toMatchObject({ operation: "plan_quote", input: request });
  runtime.respond(1, sent[0].request_id, {
    ok: true,
    value: {
      model_id: "flux-kontext-fal",
      provider: "fal",
      cost_request: { kind: "image", count: 1 },
      subject: { project_id: "film", subject_id: "asset-1" },
      inputs: { prompt: "A sock puppet detective", reference_variant_ids: [] },
      estimate: { kind: "unavailable", reason: "FAL pricing refused the key." },
    },
  });
  await expect.poll(() => sent.length).toBe(2);
  expect(sent[1]).toMatchObject({ operation: "start_job" });
  runtime.respond(1, sent[1].request_id, { ok: true, value: null });
  expect(await job).toMatchObject({ ok: true, value: { status: "accepted", estimate: null } });
  expect(runtime.commands).not.toHaveProperty("get_agent_budget");
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
