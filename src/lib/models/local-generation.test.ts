import { expect, it, vi } from "vitest";
import { generateLocalImage, generateLocalVideo } from "./local-generation";
const http = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("./http", () => http);
const config = {
  endpoint: "http://127.0.0.1:8080",
  image_model: "my-sdxl",
  video_model: "my-wan",
};
it("generates local images through the OpenAI-compatible JSON endpoint without requiring a key", async () => {
  http.fetch.mockResolvedValue(
    new Response(JSON.stringify({ data: [{ b64_json: "aA==" }] })),
  );
  expect(await generateLocalImage(config, "Morning", "")).toMatchObject({
    ok: true,
    value: {
      media: "data:image/png;base64,aA==",
      receipt: { reported_microusd: null },
    },
  });
  expect(http.fetch.mock.calls[0][0]).toBe(
    "http://127.0.0.1:8080/v1/images/generations",
  );
  expect(JSON.parse(http.fetch.mock.calls[0][1].body)).toMatchObject({
    model: "my-sdxl",
    response_format: "url",
  });
  expect(http.fetch.mock.calls[0][1].headers).not.toHaveProperty(
    "Authorization",
  );
});
it("generates local video with JSON conditioning and base64 media output", async () => {
  http.fetch.mockResolvedValue(
    new Response(
      JSON.stringify({ id: "local-job", data: [{ b64_json: "dmlkZW8=" }] }),
    ),
  );
  const result = await generateLocalVideo(
    config,
    {
      mode: "image-to-video",
      prompt: "Morning",
      startImage: "data:image/png;base64,aA==",
      settings: { duration: "8s" },
    },
    "",
  );
  expect(result).toMatchObject({
    ok: true,
    value: {
      receipt: { reported_microusd: null, provider_request_id: "local-job" },
    },
  });
  const [url, options] = http.fetch.mock.calls.at(-1)!;
  expect(url).toBe("http://127.0.0.1:8080/video");
  expect(options.timeout_ms).toBe(3600000);
  expect(JSON.parse(options.body)).toMatchObject({
    model: "my-wan",
    start_image: "data:image/png;base64,aA==",
    seconds: "8",
    response_format: "url",
  });
  if (result.ok) expect(await result.value.media.text()).toBe("video");
});

it("preserves the local server's error message and connection failure cause", async () => {
  http.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "Model my-wan is not installed." } }), { status: 404 }));
  expect(await generateLocalVideo(config, { mode: "text-to-video", prompt: "Morning", settings: { duration: "8s" } }, "")).toMatchObject({ ok: false, error: { message: expect.stringContaining("Model my-wan is not installed.") } });
  http.fetch.mockRejectedValueOnce(new Error("ECONNREFUSED 127.0.0.1:8080"));
  expect(await generateLocalImage(config, "Morning", "")).toMatchObject({ ok: false, error: { message: expect.stringContaining("ECONNREFUSED") } });
});


it("downloads a local video URL as binary media instead of nesting base64 JSON", async () => {
  http.fetch.mockClear();
  http.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: "fixture-job", data: [{ url: "/generated-videos/fixture.mp4" }] })))
    .mockResolvedValueOnce(new Response("fixture-video", { headers: { "content-type": "video/mp4" } }));
  const result = await generateLocalVideo(config, { mode: "text-to-video", prompt: "Morning", settings: { duration: "8s" } }, "fixture-local-key");
  expect(result).toMatchObject({ ok: true, value: { receipt: { provider_request_id: "fixture-job", reported_microusd: null } } });
  if (result.ok) expect(await result.value.media.text()).toBe("fixture-video");
  expect(http.fetch.mock.calls[1][0]).toBe("http://127.0.0.1:8080/generated-videos/fixture.mp4");
  expect(http.fetch.mock.calls[1][1].headers).toHaveProperty("Authorization", "Bearer fixture-local-key");
});

it("does not forward a local server key to a different media origin", async () => {
  http.fetch.mockClear();
  http.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: "fixture-job", data: [{ url: "https://media.example.invalid/fixture.mp4" }] })))
    .mockResolvedValueOnce(new Response("fixture-video", { headers: { "content-type": "video/mp4" } }));
  expect(await generateLocalVideo(config, { mode: "text-to-video", prompt: "Morning", settings: { duration: "8s" } }, "fixture-secret")).toMatchObject({ ok: true });
  expect(http.fetch.mock.calls[1][1].headers).not.toHaveProperty("Authorization");
});

it.each(["file:///tmp/fixture.mp4", "https://user:password@media.example.invalid/fixture.mp4"])("rejects an unsupported returned media URL %s", async (url) => {
  http.fetch.mockClear();
  http.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: "fixture-job", data: [{ url }] })));
  expect(await generateLocalVideo(config, { mode: "text-to-video", prompt: "Morning", settings: { duration: "8s" } }, "fixture-secret")).toMatchObject({ ok: false, receipt: { provider_request_id: "fixture-job", reported_microusd: null } });
  expect(http.fetch).toHaveBeenCalledTimes(1);
});

it("keeps the local request identity if its generated media cannot be downloaded", async () => {
  http.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: "fixture-job", data: [{ url: "/generated-videos/missing.mp4" }] })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Generated media expired." }), { status: 404 }));
  expect(await generateLocalVideo(config, { mode: "text-to-video", prompt: "Morning", settings: { duration: "8s" } }, "")).toMatchObject({ ok: false, error: { message: expect.stringContaining("Generated media expired.") }, receipt: { provider_request_id: "fixture-job" } });
});

it("does not forward an end frame that the local model profile does not advertise", async () => {
  http.fetch.mockClear();
  http.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ b64_json: "dmlkZW8=" }] })));
  await generateLocalVideo(config, { mode: "image-to-video", prompt: "Morning", startImage: "start", endImage: "stale-end-frame", settings: { duration: "8s" } }, "");
  expect(JSON.parse(http.fetch.mock.calls[0][1].body)).not.toHaveProperty("end_image");
});

it.each([new Response("<html>proxy error</html>", { headers: { "content-type": "text/html" } }), new Response("", { headers: { "content-type": "video/mp4" } })])("rejects empty or non-video downloads instead of saving them as a successful clip", async (download) => {
  http.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: "fixture-job", data: [{ url: "/generated-videos/fixture.mp4" }] }))).mockResolvedValueOnce(download);
  expect(await generateLocalVideo(config, { mode: "text-to-video", prompt: "Morning", settings: { duration: "8s" } }, "")).toMatchObject({ ok: false, receipt: { provider_request_id: "fixture-job" } });
});
