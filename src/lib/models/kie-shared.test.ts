import { afterEach, expect, it, vi } from "vitest";
import { createKieTask, pollKieTask, uploadImageToKie } from "./kie-shared";
const http = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("./http", () => http);
afterEach(() => vi.useRealTimers());
it.each([
  [401, { code: "401", data: [] }, "Invalid kie.ai API key."],
  [
    402,
    { error: { message: "balance empty" }, data: [] },
    "Insufficient kie.ai credits",
  ],
  [429, { code: "429", data: [] }, "kie.ai rate limit exceeded"],
])(
  "explains HTTP %s even when the error body violates the success schema",
  async (status, body, message) => {
    http.fetch.mockResolvedValueOnce(
      new Response(JSON.stringify(body), { status }),
    );
    await expect(createKieTask("test-model", {}, "key")).rejects.toThrow(
      message,
    );
  },
);
it("explains a string API error code in an HTTP-success response", async () => {
  http.fetch.mockResolvedValueOnce(
    new Response(JSON.stringify({ code: "402", data: [] })),
  );
  await expect(uploadImageToKie("image", "key")).rejects.toThrow(
    "Insufficient kie.ai credits",
  );
});
it("preserves nested provider errors while polling", async () => {
  vi.useFakeTimers();
  http.fetch.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        code: "500",
        error: { message: "Task storage unavailable" },
        data: [],
      }),
    ),
  );
  const pending = expect(pollKieTask("task", "key")).rejects.toThrow(
    "Task storage unavailable",
  );
  await vi.runAllTimersAsync();
  await pending;
});
it("explains a malformed Flux Kontext error through the image transport", async () => {
  const { kieImageTransport } = await import("./transports/kie-image");
  const { validateImageConfig } = await import("./config-schema");
  const config = validateImageConfig(
    (await import("./providers/image/flux-kontext.json")).default,
  );
  http.fetch.mockResolvedValueOnce(
    new Response(JSON.stringify({ code: "402", data: [] }), { status: 402 }),
  );
  await expect(
    kieImageTransport.generateImage(config, "morning", "key"),
  ).rejects.toThrow("Insufficient kie.ai credits");
});
it("preserves an HTTP-success provider error even when no API code is supplied", async () => {
  http.fetch.mockResolvedValueOnce(
    new Response(
      JSON.stringify({ error: { message: "Account temporarily disabled" } }),
    ),
  );
  await expect(createKieTask("test-model", {}, "key")).rejects.toThrow(
    "Account temporarily disabled",
  );
});
it("recovers transient KIE polling errors without submitting another task", async () => {
  vi.useFakeTimers();
  http.fetch.mockReset().mockResolvedValueOnce(new Response("busy", { status: 502 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ code: "429", data: null })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ code: 200, data: { state: "success", resultJson: JSON.stringify({ resultUrls: ["https://media.example/result.mp4"] }) } })));
  const pending = pollKieTask("existing-kie-task", "key").then(value => ({ value }), (error: unknown) => ({ error }));
  await vi.runAllTimersAsync();
  expect(await pending).toEqual({ value: "https://media.example/result.mp4" });
  expect(http.fetch.mock.calls.every(([url, init]) => String(url).includes("taskId=existing-kie-task") && !init.method)).toBe(true);
});
it("keeps the KIE task identity on permanent or exhausted status failures", async () => {
  vi.useFakeTimers();
  http.fetch.mockReset().mockResolvedValue(new Response("denied", { status: 401 }));
  const pending = pollKieTask("denied-task", "key").then(() => null, (error: unknown) => error);
  await vi.runAllTimersAsync();
  expect(await pending).toEqual(expect.objectContaining({ message: expect.stringContaining("denied-task") }));
  expect(http.fetch).toHaveBeenCalledTimes(1);
});
