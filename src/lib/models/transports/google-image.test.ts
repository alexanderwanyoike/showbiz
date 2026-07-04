import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ImageModelConfig } from "../config-schema";

vi.mock("../http", () => ({
  fetch: vi.fn(),
}));

import { googleImageTransport } from "./google-image";
import { fetch } from "../http";

const mockFetch = vi.mocked(fetch);

const config: ImageModelConfig = {
  id: "nano-banana",
  name: "Nano Banana",
  description: "test",
  transport: "google-image",
  enabled: true,
  apiKeyProvider: "gemini",
  models: { generate: "gemini-2.5-flash-image", edit: "gemini-2.5-flash-image" },
  supportsEditing: true,
  supportsInpainting: false,
};

function imageResponse() {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        candidates: [
          { content: { parts: [{ inlineData: { data: "Zm9v", mimeType: "image/png" } }] } },
        ],
      }),
  };
}

describe("googleImageTransport.composeImage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends the prompt plus every reference image as inline_data parts", async () => {
    mockFetch.mockResolvedValue(imageResponse() as never);
    const refs = ["data:image/png;base64,AAA", "data:image/jpeg;base64,BBB"];

    const result = await googleImageTransport.composeImage!(
      config,
      "Mara in the throne room, holding the dagger",
      refs,
      "key"
    );

    expect(result).toBe("data:image/png;base64,Zm9v");

    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    const parts = body.contents[0].parts;
    expect(parts[0]).toEqual({ text: "Mara in the throne room, holding the dagger" });
    expect(parts.slice(1)).toEqual([
      { inline_data: { mime_type: "image/png", data: "AAA" } },
      { inline_data: { mime_type: "image/jpeg", data: "BBB" } },
    ]);
  });

  it("rejects an empty reference list", async () => {
    await expect(
      googleImageTransport.composeImage!(config, "prompt", [], "key")
    ).rejects.toThrow("at least one reference image");
  });

  it("rejects a malformed reference data URL", async () => {
    await expect(
      googleImageTransport.composeImage!(config, "prompt", ["not-a-data-url"], "key")
    ).rejects.toThrow("Invalid reference image");
  });
});
