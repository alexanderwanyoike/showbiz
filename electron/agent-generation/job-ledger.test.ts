import { describe, expect, it } from "vitest";
import { openTestDb } from "../db.test";
import { createAgentJobLedger, type NewAgentJob } from "./job-ledger";

const job = (overrides: Partial<NewAgentJob> = {}): NewAgentJob => ({
  job_id: "job-1",
  request_id: "agent-request-1",
  quote_id: "quote-1",
  grant_id: "grant-1",
  project_id: "film",
  subject_id: "asset-1",
  usage_request_id: "usage-1",
  model_id: "flux-dev-fal",
  kind: "image",
  reserved_microusd: 25_000,
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
      status: "accepted",
      reserved_microusd: 25_000,
      reported_microusd: null,
      provider_called: null,
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

  it("holds the quoted maximum until a charge is confirmed, and releases it only when the provider was never called", () => {
    const { ledger } = setup();
    ledger.insert(job());
    ledger.insert(job({ job_id: "job-2", request_id: "r2", usage_request_id: "u2", reserved_microusd: 40_000 }));
    ledger.insert(job({ job_id: "job-3", request_id: "r3", usage_request_id: "u3", reserved_microusd: 70_000 }));
    expect(ledger.spend("grant-1")).toEqual({ committed_microusd: 135_000, frozen: false });
    ledger.update("job-1", { status: "completed", provider_called: true, reported_microusd: 20_000 });
    ledger.update("job-2", { status: "failed", provider_called: false, error: "No key" });
    ledger.update("job-3", { status: "failed", provider_called: true, error: "Timed out" });
    expect(ledger.spend("grant-1")).toEqual({ committed_microusd: 90_000, frozen: false });
    expect(ledger.spend("other-grant")).toEqual({ committed_microusd: 0, frozen: false });
  });

  it("freezes the grant when a confirmed charge exceeds what was held", () => {
    const { ledger } = setup();
    ledger.insert(job());
    ledger.update("job-1", { status: "completed", provider_called: true, reported_microusd: 26_000 });
    expect(ledger.spend("grant-1")).toEqual({ committed_microusd: 26_000, frozen: true });
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
    expect(ledger.spend("grant-1").committed_microusd).toBe(50_000);
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
