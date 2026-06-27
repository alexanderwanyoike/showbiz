import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ImageModelConfig } from "../config-schema";

vi.mock("../http", () => ({
  fetch: vi.fn(),
}));

import { googleInteractionsImageTransport } from "./google-interactions-image";
import { fetch } from "../http";

const mockFetch = vi.mocked(fetch);

const config: ImageModelConfig = {
  id: "nano-banana-pro",
  name: "Nano Banana Pro",
  description: "test",
  transport: "google-interactions-image",
  enabled: true,
  apiKeyProvider: "gemini",
  models: { generate: "gemini-3-pro-image", edit: "gemini-3-pro-image" },
  supportsEditing: true,
  supportsInpainting: false,
};

function imageResponse() {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        status: "completed",
        steps: [
          { type: "model_output", content: [{ type: "image", data: "Zm9v", mime_type: "image/png" }] },
        ],
      }),
  };
}

describe("googleInteractionsImageTransport", () => {
  beforeEach(() => vi.clearAllMocks());

  it("generateImage posts to the interactions endpoint with a single text part", async () => {
    mockFetch.mockResolvedValue(imageResponse() as never);

    const result = await googleInteractionsImageTransport.generateImage(config, "a knight", "key");

    expect(result).toBe("data:image/png;base64,Zm9v");
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/interactions");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe("gemini-3-pro-image");
    expect(body.input).toEqual([{ type: "text", text: "a knight" }]);
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["x-goog-api-key"]).toBe("key");
  });

  it("composeImage sends the prompt plus each reference as an image part", async () => {
    mockFetch.mockResolvedValue(imageResponse() as never);
    const refs = ["data:image/png;base64,AAA", "data:image/jpeg;base64,BBB"];

    const result = await googleInteractionsImageTransport.composeImage!(
      config,
      "Mara in the throne room",
      refs,
      "key"
    );

    expect(result).toBe("data:image/png;base64,Zm9v");
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.input).toEqual([
      { type: "text", text: "Mara in the throne room" },
      { type: "image", data: "AAA", mime_type: "image/png" },
      { type: "image", data: "BBB", mime_type: "image/jpeg" },
    ]);
  });

  it("editImage sends exactly one image part", async () => {
    mockFetch.mockResolvedValue(imageResponse() as never);

    await googleInteractionsImageTransport.editImage!(
      config,
      "make it night",
      "data:image/png;base64,AAA",
      "key"
    );

    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.input).toEqual([
      { type: "text", text: "make it night" },
      { type: "image", data: "AAA", mime_type: "image/png" },
    ]);
  });

  it("rejects an empty reference list for compose", async () => {
    await expect(
      googleInteractionsImageTransport.composeImage!(config, "prompt", [], "key")
    ).rejects.toThrow("at least one reference image");
  });

  it("rejects a malformed reference data URL", async () => {
    await expect(
      googleInteractionsImageTransport.composeImage!(config, "prompt", ["nope"], "key")
    ).rejects.toThrow("Invalid reference image");
  });
});
