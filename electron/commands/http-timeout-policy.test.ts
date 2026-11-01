import { expect, it, vi } from "vitest";
const observed = vi.hoisted(() => ({ options: [] as unknown[] }));
vi.mock("undici", () => ({ Agent: class { constructor(options: unknown) { observed.options.push(options); } } }));
import { buildFetchArgs } from "./http";

it("opts long inference into zero inactivity timeouts as well as an overall deadline", () => {
  const request = buildFetchArgs({ url: "http://127.0.0.1:8080/video", method: "POST", body: "{}", headers: [], timeout_ms: 3600000 });
  expect(request.init.dispatcher).toBeDefined();
  expect(request.init.signal).toBeInstanceOf(AbortSignal);
  expect(observed.options).toEqual([{ headersTimeout: 0, bodyTimeout: 0 }]);
});
