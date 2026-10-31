import { expect, it, vi } from "vitest";
import { generateImageAction } from "../../actions/generation-actions";
const mocks = vi.hoisted(() => ({fetch: vi.fn(), invoke: vi.fn()}));
vi.mock("./http", () => ({fetch: mocks.fetch}));
vi.mock("../bridge", () => ({invoke: mocks.invoke}));
it("uses the configured local model through the existing generation action without requiring a remote credential", async () => {
  mocks.invoke.mockImplementation(async (command) => command === "get_local_generation_config" ? {ok: true, value: {endpoint: "http://localhost:8080", image_model: "my-sdxl", video_model: "wan"}} : null);
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({data: [{b64_json: "aA=="}]})));
  expect(await generateImageAction("Morning", "local-image")).toBe("data:image/png;base64,aA==");
  expect(JSON.parse(mocks.fetch.mock.calls[0][1].body).model).toBe("my-sdxl");
});
