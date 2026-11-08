import { expect, it } from "vitest";
import { toolResult } from "./server";
import { mcpTools } from "./tools";

it("returns previews as MCP image content without repeating the bytes as text", () => {
  const result = toolResult({
    ok: true,
    value: {
      revision: 3,
      data: {
        ok: true,
        value: {
          images: [{ mime_type: "image/jpeg", base64: "QUJD", width: 512, height: 288 }],
        },
      },
    },
  });
  expect(result.content).toEqual([
    {
      type: "text",
      text: JSON.stringify({
        ok: true,
        value: {
          revision: 3,
          data: { ok: true, value: { images: [{ mime_type: "image/jpeg", width: 512, height: 288 }] } },
        },
      }),
    },
    { type: "image", data: "QUJD", mimeType: "image/jpeg" },
  ]);
  expect(JSON.stringify(result.structuredContent)).not.toContain("QUJD");
});

it("exposes a read-only preview tool", () => {
  expect(mcpTools.find((tool) => tool.name === "get_media_preview")).toMatchObject({
    mutates: false,
    command: "get_media_preview",
  });
});
