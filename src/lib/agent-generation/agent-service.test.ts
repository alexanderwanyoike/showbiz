import { afterEach, expect, it, vi } from "vitest";
import { connectAgentService } from "./agent-service";

const planner = vi.hoisted(() => ({ planAgentQuote: vi.fn() }));
vi.mock("./plan-quote", () => planner);

type Request = { request_id: string; operation: string; input: unknown };
function app() {
  let handler: ((request: Request) => void) | undefined;
  const respondAgentRequest = vi.fn(async () => undefined);
  vi.stubGlobal("window", {
    showbiz: {
      onAgentRequest: (callback: (request: Request) => void) => {
        handler = callback;
        return () => (handler = undefined);
      },
      respondAgentRequest,
    },
  });
  return {
    respondAgentRequest,
    send: (request: Request) => handler?.(request),
    connected: () => !!handler,
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  planner.planAgentQuote.mockReset();
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
