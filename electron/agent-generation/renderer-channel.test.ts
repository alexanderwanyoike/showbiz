import { describe, expect, it, vi } from "vitest";
import { createRendererChannel } from "./renderer-channel";

function window(id = 7) {
  const sent: { channel: string; payload: { request_id: string; operation: string; input: unknown } }[] = [];
  return {
    sent,
    target: {
      id,
      send: (channel: string, payload: unknown) =>
        sent.push({ channel, payload: payload as (typeof sent)[number]["payload"] }),
    },
  };
}

describe("renderer agent channel", () => {
  it("asks the app window and resolves with its answer", async () => {
    const app = window();
    const channel = createRendererChannel({ target: () => app.target });
    const answer = channel.request("plan_quote", { prompt: "hi" });
    expect(app.sent).toEqual([
      {
        channel: "showbiz:agent_request",
        payload: {
          request_id: expect.any(String) as string,
          operation: "plan_quote",
          input: { prompt: "hi" },
        },
      },
    ]);
    channel.respond(7, app.sent[0].payload.request_id, { ok: true, value: 42 });
    expect(await answer).toEqual({ ok: true, value: 42 });
  });

  it("is unavailable without an app window", async () => {
    const channel = createRendererChannel({ target: () => null });
    expect(await channel.request("plan_quote", {})).toMatchObject({
      ok: false,
      error: { code: "UNAVAILABLE" },
    });
  });

  it("ignores answers from another window", async () => {
    const app = window(7);
    const channel = createRendererChannel({ target: () => app.target, timeoutMs: 50 });
    const answer = channel.request("plan_quote", {});
    channel.respond(8, app.sent[0].payload.request_id, { ok: true, value: "forged" });
    expect(await answer).toMatchObject({ ok: false, error: { code: "UNAVAILABLE" } });
  });

  it("gives up when the window does not answer in time", async () => {
    vi.useFakeTimers();
    try {
      const app = window();
      const channel = createRendererChannel({ target: () => app.target, timeoutMs: 1000 });
      const answer = channel.request("plan_quote", {});
      await vi.advanceTimersByTimeAsync(1000);
      expect(await answer).toMatchObject({ ok: false, error: { code: "UNAVAILABLE" } });
      channel.respond(7, app.sent[0].payload.request_id, { ok: true, value: "late" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects malformed answers", async () => {
    const app = window();
    const channel = createRendererChannel({ target: () => app.target });
    const answer = channel.request("plan_quote", {});
    channel.respond(7, app.sent[0].payload.request_id, { value: 1 });
    expect(await answer).toMatchObject({ ok: false, error: { code: "IO_ERROR" } });
  });

  it("rejects error codes the agent contract does not define", async () => {
    const app = window();
    const channel = createRendererChannel({ target: () => app.target });
    const answer = channel.request("plan_quote", {});
    channel.respond(7, app.sent[0].payload.request_id, {
      ok: false,
      error: { code: "ROOT_ACCESS", message: "nope" },
    });
    expect(await answer).toMatchObject({ ok: false, error: { code: "IO_ERROR" } });
  });

  it("fails pending work at once when its window goes away", async () => {
    const app = window(7);
    const channel = createRendererChannel({ target: () => app.target, timeoutMs: 60_000 });
    const answer = channel.request("plan_quote", {});
    channel.abandon(8);
    channel.abandon(7);
    expect(await answer).toMatchObject({ ok: false, error: { code: "UNAVAILABLE" } });
  });
});
