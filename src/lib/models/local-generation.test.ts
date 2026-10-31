import { expect, it, vi } from "vitest";
import { generateLocalImage, generateLocalVideo } from "./local-generation";
const http = vi.hoisted(() => ({fetch: vi.fn()}));
vi.mock("./http", () => http);
const config = {endpoint: "http://127.0.0.1:8080", image_model: "my-sdxl", video_model: "my-wan"};
it("generates local images through the OpenAI-compatible JSON endpoint without requiring a key", async () => {
  http.fetch.mockResolvedValue(new Response(JSON.stringify({data: [{b64_json: "aA=="}]})));
  expect(await generateLocalImage(config, "Morning", "")).toMatchObject({ok: true, value: {media: "data:image/png;base64,aA==", receipt: {reported_microusd: null}}});
  expect(http.fetch.mock.calls[0][0]).toBe("http://127.0.0.1:8080/v1/images/generations");
  expect(JSON.parse(http.fetch.mock.calls[0][1].body)).toMatchObject({model: "my-sdxl", response_format: "b64_json"});
  expect(http.fetch.mock.calls[0][1].headers).not.toHaveProperty("Authorization");
});
it("generates local video with JSON conditioning and base64 media output", async () => {
  http.fetch.mockResolvedValue(new Response(JSON.stringify({id: "local-job", data: [{b64_json: "dmlkZW8="}]})));
  const result = await generateLocalVideo(config, {mode: "image-to-video", prompt: "Morning", startImage: "data:image/png;base64,aA==", settings: {duration: "8s"}}, "");
  expect(result).toMatchObject({ok: true, value: {receipt: {reported_microusd: null, provider_request_id: "local-job"}}});
  const [url, options] = http.fetch.mock.calls.at(-1)!;
  expect(url).toBe("http://127.0.0.1:8080/video");
  expect(JSON.parse(options.body)).toMatchObject({model: "my-wan", start_image: "data:image/png;base64,aA==", seconds: "8", response_format: "b64_json"});
  if(result.ok)expect(await result.value.media.text()).toBe("video");
});
