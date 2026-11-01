import { expect, it, vi } from "vitest";
import { createHttpCommands } from "../../../electron/commands/http";
import { fetch } from "./http";
const native = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("../bridge", () => native);
it("preserves the response media type through the main-process HTTP proxy", async () => {
  const commands = createHttpCommands(
    async () =>
      new Response('{"job":1}', {
        headers: {
          "content-type": "application/json",
          "set-cookie": "private=value",
        },
      }),
  );
  native.invoke.mockImplementation((_command, args) =>
    commands.http_request(args),
  );
  const response = await fetch("https://api.example.com/generate");
  expect(response.headers.get("content-type")).toBe("application/json");
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(await response.json()).toEqual({ job: 1 });
  expect(await (await response.blob()).text()).toBe('{"job":1}');
});

it("forwards a scoped long-running timeout through the native proxy without changing ordinary calls", async () => {
  const calls: Record<string, unknown>[] = [];
  const commands = createHttpCommands(async (_url, init) => { calls.push(init ?? {}); return new Response("media"); });
  native.invoke.mockImplementation((_command, args) => commands.http_request(args));
  await fetch("http://127.0.0.1:8080/video", { method: "POST", timeout_ms: 3600000 });
  expect(calls[0].signal).toBeInstanceOf(AbortSignal);
  expect(calls[0].dispatcher).toHaveProperty("dispatch", expect.any(Function));
  await fetch("https://api.example.com/models");
  expect(calls[1]).not.toHaveProperty("dispatcher");
  expect(calls[1]).not.toHaveProperty("signal");
});
