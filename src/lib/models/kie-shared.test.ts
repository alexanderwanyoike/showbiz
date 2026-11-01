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
