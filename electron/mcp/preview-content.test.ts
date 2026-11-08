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

it("refuses empty or ambiguous preview requests before asking the app", () => {
  const tool = mcpTools.find((entry) => entry.name === "get_media_preview");
  expect(tool?.schema.safeParse({}).success).toBe(false);
  expect(tool?.schema.safeParse({ bible_variant_id: "a", image_take_id: "b" }).success).toBe(false);
  expect(tool?.schema.safeParse({ image_take_id: "b" }).success).toBe(true);
});
