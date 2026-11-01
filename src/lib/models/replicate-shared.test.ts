import { afterEach, expect, it, vi } from "vitest";
import { pollPrediction } from "./replicate-shared";
const http = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("./http", () => http);
afterEach(() => vi.useRealTimers());
it("recovers transient Replicate status failures without resubmitting a prediction", async () => {
  vi.useFakeTimers();
  http.fetch.mockResolvedValueOnce(new Response("busy", { status: 503 }))
    .mockRejectedValueOnce(new Error("connection reset"))
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: "existing-prediction", status: "succeeded", output: "media" })));
  const pending = pollPrediction("existing-prediction", "key").then(value => ({ value }), (error: unknown) => ({ error }));
  await vi.runAllTimersAsync();
  expect(await pending).toMatchObject({ value: { id: "existing-prediction", status: "succeeded" } });
  expect(http.fetch.mock.calls.every(([url, options]) => url.endsWith("/existing-prediction") && !options.method)).toBe(true);
});
it("includes the prediction identity when repeated polling fails", async () => {
  vi.useFakeTimers();
  http.fetch.mockReset().mockResolvedValue(new Response("denied", { status: 401 }));
  const pending = pollPrediction("denied-prediction", "key").then(() => null, (error: unknown) => error);
  await vi.runAllTimersAsync();
  expect(await pending).toEqual(expect.objectContaining({ message: expect.stringContaining("denied-prediction") }));
  expect(http.fetch).toHaveBeenCalledTimes(1);
});
