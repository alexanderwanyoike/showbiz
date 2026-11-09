import { describe, expect, it } from "vitest";
import { loadMigrations, migrate, openDatabase } from "../db";
import { MIGRATIONS_DIR, openTestDb } from "../db.test";
import { createAgentJobLedger, type NewAgentJob } from "./job-ledger";

const estimate = {
  min_microusd: 20_000,
  max_microusd: 25_000,
  price_source: "https://fal.ai/docs",
  price_checked_at: "2026-11-08T09:59:00.000Z",
  price_stale: false,
  excludes_input_cost: false,
};
const job = (overrides: Partial<NewAgentJob> = {}): NewAgentJob => ({
  job_id: "job-1",
  request_id: "agent-request-1",
  request_fingerprint: "fingerprint-1",
  project_id: "film",
  subject_id: "asset-1",
  usage_request_id: "usage-1",
  model_id: "flux-dev-fal",
  kind: "image",
  estimate,
  ...overrides,
});

function setup() {
  const db = openTestDb();
  let now = Date.parse("2026-11-08T10:00:00.000Z");
  return {
    db,
    ledger: createAgentJobLedger(db, () => now),
    advance: (ms: number) => (now += ms),
  };
}

describe("agent job ledger", () => {
  it("persists a job by its request ID before any provider call", () => {
    const { db, ledger } = setup();
    ledger.insert(job());
    const reopened = createAgentJobLedger(db);
    expect(reopened.find("agent-request-1")).toMatchObject({
      job_id: "job-1",
      request_fingerprint: "fingerprint-1",
      status: "accepted",
      estimate,
      reported_microusd: null,
      provider_called: null,
      charge_status: "estimated",
      result: null,
      warnings: [],
      created_at: "2026-11-08T10:00:00.000Z",
    });
    expect(reopened.get("job-1")?.request_id).toBe("agent-request-1");
  });

  it("refuses a second job for the same request ID", () => {
    const { ledger } = setup();
    ledger.insert(job());
    expect(() => ledger.insert(job({ job_id: "job-2" }))).toThrow();
    expect(ledger.list("film", 0, 10).map((entry) => entry.job_id)).toEqual(["job-1"]);
  });

  it("says whether a charge is confirmed, estimated, unknown or never made", () => {
    const { ledger } = setup();
    ledger.insert(job());
    ledger.insert(job({ job_id: "job-2", request_id: "r2", usage_request_id: "u2", estimate: null }));
    expect(ledger.get("job-1")?.charge_status).toBe("estimated");
    expect(ledger.get("job-2")?.charge_status).toBe("unknown");
    ledger.update("job-1", { status: "completed", provider_called: true, reported_microusd: 21_000 });
    ledger.update("job-2", { status: "failed", provider_called: false, error: "No key" });
    expect(ledger.get("job-1")?.charge_status).toBe("confirmed");
    expect(ledger.get("job-2")?.charge_status).toBe("released");
  });

  it("counts unfinished jobs and marks them interrupted after a restart", () => {
    const { ledger, advance } = setup();
    ledger.insert(job());
    ledger.insert(job({ job_id: "job-2", request_id: "r2", usage_request_id: "u2" }));
    ledger.update("job-2", { status: "running" });
    expect(ledger.unfinished()).toBe(2);
    advance(1000);
    ledger.recoverInterrupted();
    expect(ledger.unfinished()).toBe(0);
    expect(ledger.get("job-2")).toMatchObject({
      status: "interrupted",
      updated_at: "2026-11-08T10:00:01.000Z",
    });
  });

  it("records results and warnings and lists a project's newest jobs first", () => {
    const { ledger, advance } = setup();
    ledger.insert(job());
    advance(1000);
    ledger.insert(job({ job_id: "job-2", request_id: "r2", usage_request_id: "u2", project_id: "other" }));
    advance(1000);
    ledger.insert(job({ job_id: "job-3", request_id: "r3", usage_request_id: "u3" }));
    ledger.update("job-1", {
      status: "completed",
      provider_called: true,
      result: { variant_id: "variant-9" },
      warnings: ["Receipt pending"],
    });
    expect(ledger.get("job-1")).toMatchObject({
      result: { variant_id: "variant-9" },
      warnings: ["Receipt pending"],
    });
    expect(ledger.list("film", 0, 10).map((entry) => entry.job_id)).toEqual(["job-3", "job-1"]);
    expect(ledger.list("film", 1, 10).map((entry) => entry.job_id)).toEqual(["job-1"]);
  });
});

it("drops the saved budget grant and keeps earlier jobs, whose request IDs stay used", () => {
  const migrations = loadMigrations(MIGRATIONS_DIR);
  const before = migrations.findIndex((sql) => sql.includes("CREATE TABLE agent_generation_jobs")) + 1;
  const db = openDatabase(":memory:", migrations.slice(0, before));
  db.prepare("INSERT INTO settings(key, value) VALUES ('agent_budget_grant', '{}')").run();
  db.prepare(
    `INSERT INTO agent_generation_jobs(request_id,job_id,quote_id,grant_id,project_id,subject_id,usage_request_id,model_id,kind,reserved_microusd,reported_microusd,provider_called,status,created_at,updated_at)
     VALUES ('old-request','old-job','quote-1','grant-1','film','asset-1','usage-old','flux-dev-fal','image',25000,21000,1,'completed','2026-11-01T10:00:00.000Z','2026-11-01T10:00:05.000Z')`,
  ).run();
  migrate(db, migrations);
  expect(db.prepare("SELECT value FROM settings WHERE key = 'agent_budget_grant'").get()).toBeUndefined();
  const ledger = createAgentJobLedger(db);
  expect(ledger.find("old-request")).toMatchObject({
    job_id: "old-job",
    status: "completed",
    reported_microusd: 21_000,
    charge_status: "confirmed",
    estimate: null,
  });
  expect(ledger.find("old-request")?.request_fingerprint).not.toMatch(/^[0-9a-f]{64}$/);
  expect(() => ledger.insert(job({ request_id: "old-request" }))).toThrow();
});
