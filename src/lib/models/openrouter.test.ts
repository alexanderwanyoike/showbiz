import { expect, it, vi } from "vitest";
import { generateOpenRouterImage } from "./openrouter-image";
const http = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("./http", () => http);
it("generates a referenced image through the dedicated API and retains its reported charge", async () => {
  http.fetch.mockResolvedValue(new Response(JSON.stringify({ id: "image-job", data: [{b64_json: "aGVsbG8=", media_type: "image/png"}], usage: {cost: 0.04} })));
  const result = await generateOpenRouterImage({model: "bytedance-seed/seedream-4.5", prompt: "Morning", references: ["data:image/png;base64,aGVsbG8="]}, "test-key");
  expect(result).toMatchObject({ok: true, value: {media: "data:image/png;base64,aGVsbG8=", receipt: {reported_microusd: 40000, provider_request_id: "image-job"}}});
  const [url, options] = http.fetch.mock.calls[0];
  expect(url).toBe("https://openrouter.ai/api/v1/images");
  expect(JSON.parse(options.body)).toMatchObject({model: "bytedance-seed/seedream-4.5", prompt: "Morning", input_references: [{type: "image_url", image_url: {url: "data:image/png;base64,aGVsbG8="}}]});
});
