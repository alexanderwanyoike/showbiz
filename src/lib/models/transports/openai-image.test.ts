import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ImageModelConfig } from "../config-schema";

vi.mock("../http", () => ({
  fetch: vi.fn(),
}));

import { openaiImageTransport } from "./openai-image";
import { fetch } from "../http";

const mockFetch = vi.mocked(fetch);

const config: ImageModelConfig = {
  id: "gpt-image-2",
  name: "GPT Image 2",
  description: "test",
  transport: "openai-image",
  enabled: true,
  apiKeyProvider: "openai",
  models: { generate: "gpt-image-2", edit: "gpt-image-2" },
  transportOptions: { responsesModel: "gpt-5.1" },
  fixedParams: { size: "1024x1024" },
  supportsEditing: true,
  supportsInpainting: false,
};

function jsonResponse(payload: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve(payload) };
}

describe("openaiImageTransport.generateImage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls the Images API and returns the b64 image as a data URL", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: [{ b64_json: "Zm9v" }] }) as never);

    const result = await openaiImageTransport.generateImage(config, "a knight at dusk", "key");

    expect(result).toBe("data:image/png;base64,Zm9v");
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/images/generations");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({ model: "gpt-image-2", prompt: "a knight at dusk", size: "1024x1024" });
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer key");
  });
});

describe("openaiImageTransport.composeImage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends prompt + reference images to the Responses API with the image_generation tool", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ output: [{ type: "image_generation_call", result: "YmFy" }] }) as never
    );
    const refs = ["data:image/png;base64,AAA", "data:image/jpeg;base64,BBB"];

    const result = await openaiImageTransport.composeImage!(
      config,
      "Mara in the throne room",
      refs,
      "key"
    );

    expect(result).toBe("data:image/png;base64,YmFy");
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe("gpt-5.1");
    expect(body.tools).toEqual([{ type: "image_generation" }]);
    expect(body.input[0].content).toEqual([
      { type: "input_text", text: "Mara in the throne room" },
      { type: "input_image", image_url: "data:image/png;base64,AAA" },
      { type: "input_image", image_url: "data:image/jpeg;base64,BBB" },
    ]);
  });

  it("rejects an empty reference list", async () => {
    await expect(
      openaiImageTransport.composeImage!(config, "prompt", [], "key")
    ).rejects.toThrow("at least one reference image");
  });

  it("surfaces OpenAI error messages", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve(JSON.stringify({ error: { message: "Invalid API key" } })),
    } as never);

    await expect(
      openaiImageTransport.composeImage!(config, "prompt", ["data:image/png;base64,AAA"], "key")
    ).rejects.toThrow("Invalid API key");
  });
});
