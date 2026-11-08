import { afterEach, expect, it, vi } from "vitest";
import { connectAgentService } from "./agent-service";

const planner = vi.hoisted(() => ({ planAgentQuote: vi.fn(), resolveAgentTarget: vi.fn() }));
vi.mock("./plan-quote", () => planner);
const runner = vi.hoisted(() => ({ runAgentJob: vi.fn() }));
vi.mock("./run-job", () => runner);

type Request = { request_id: string; operation: string; input: unknown };
function app() {
  let handler: ((request: Request) => void) | undefined;
  const respondAgentRequest = vi.fn(async () => undefined);
  const reportAgentJob = vi.fn(async () => undefined);
  const dispatchEvent = vi.fn();
  vi.stubGlobal("window", {
    dispatchEvent,
    showbiz: {
      reportAgentJob,
      onAgentRequest: (callback: (request: Request) => void) => {
        handler = callback;
        return () => (handler = undefined);
      },
      respondAgentRequest,
    },
  });
  return {
    respondAgentRequest,
    reportAgentJob,
    dispatchEvent,
    send: (request: Request) => handler?.(request),
    connected: () => !!handler,
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  planner.planAgentQuote.mockReset();
  planner.resolveAgentTarget.mockReset();
  runner.runAgentJob.mockReset();
});

const quoteInput = {
  target: "bible_asset",
  operation: "generate",
  asset_id: "asset-1",
  prompt: "A sock puppet",
  model_id: "local-image",
};

it("answers quote planning requests from the main process", async () => {
  const native = app();
  planner.planAgentQuote.mockResolvedValue({ ok: true, value: "plan" });
  const stop = connectAgentService();
  native.send({ request_id: "r1", operation: "plan_quote", input: quoteInput });
  await vi.waitFor(() =>
    expect(native.respondAgentRequest).toHaveBeenCalledWith("r1", { ok: true, value: "plan" }),
  );
  expect(planner.planAgentQuote).toHaveBeenCalledWith(quoteInput);
  stop();
  expect(native.connected()).toBe(false);
});

it("refuses unknown operations and malformed input", async () => {
  const native = app();
  connectAgentService();
  native.send({ request_id: "r2", operation: "delete_everything", input: {} });
  native.send({ request_id: "r3", operation: "plan_quote", input: { target: "bible_asset" } });
  await vi.waitFor(() => expect(native.respondAgentRequest).toHaveBeenCalledTimes(2));
  for (const id of ["r2", "r3"])
    expect(native.respondAgentRequest).toHaveBeenCalledWith(id, {
      ok: false,
      error: { code: "INVALID_INPUT", message: expect.any(String) as string },
    });
  expect(planner.planAgentQuote).not.toHaveBeenCalled();
});

it("reports a planning crash instead of leaving the agent waiting", async () => {
  const native = app();
  planner.planAgentQuote.mockRejectedValue(new Error("pricing exploded"));
  connectAgentService();
  native.send({ request_id: "r4", operation: "plan_quote", input: quoteInput });
  await vi.waitFor(() =>
    expect(native.respondAgentRequest).toHaveBeenCalledWith("r4", {
      ok: false,
      error: { code: "IO_ERROR", message: "pricing exploded" },
    }),
  );
});

const jobInput = {
  job_id: "job-1",
  usage_request_id: "usage-1",
  request: quoteInput,
  plan: {
    model_id: "local-image",
    provider: "local",
    cost_request: { kind: "image", count: 1 },
    subject: { project_id: "film", subject_id: "asset-1" },
    estimate: { kind: "unavailable", reason: "none" },
  },
};

it("accepts a job at once and reports its progress back to the main process", async () => {
  const native = app();
  let finish: (() => void) | undefined;
  runner.runAgentJob.mockImplementation(
    (_job, report: (update: unknown) => Promise<void>) =>
      new Promise<void>((resolve) => {
        finish = () => {
          void report({ job_id: "job-1", status: "completed", result: {}, warnings: [] }).then(resolve);
        };
      }),
  );
  connectAgentService();
  native.send({ request_id: "r5", operation: "start_job", input: jobInput });
  await vi.waitFor(() =>
    expect(native.respondAgentRequest).toHaveBeenCalledWith("r5", { ok: true, value: null }),
  );
  expect(runner.runAgentJob).toHaveBeenCalledWith(jobInput, expect.any(Function));
  finish?.();
  await vi.waitFor(() =>
    expect(native.reportAgentJob).toHaveBeenCalledWith({
      job_id: "job-1",
      status: "completed",
      result: {},
      warnings: [],
    }),
  );
  await vi.waitFor(() =>
    expect(native.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "showbiz:project-changed" }),
    ),
  );
});

it("refuses a malformed job without running anything", async () => {
  const native = app();
  connectAgentService();
  native.send({ request_id: "r6", operation: "start_job", input: { job_id: "job-1" } });
  await vi.waitFor(() =>
    expect(native.respondAgentRequest).toHaveBeenCalledWith("r6", {
      ok: false,
      error: { code: "INVALID_INPUT", message: expect.any(String) as string },
    }),
  );
  expect(runner.runAgentJob).not.toHaveBeenCalled();
});

it("resolves a quote's target for a submit check", async () => {
  const native = app();
  planner.resolveAgentTarget.mockResolvedValue({ ok: true, value: "target" });
  connectAgentService();
  native.send({ request_id: "r7", operation: "resolve_target", input: quoteInput });
  await vi.waitFor(() =>
    expect(native.respondAgentRequest).toHaveBeenCalledWith("r7", { ok: true, value: "target" }),
  );
  expect(planner.planAgentQuote).not.toHaveBeenCalled();
});
