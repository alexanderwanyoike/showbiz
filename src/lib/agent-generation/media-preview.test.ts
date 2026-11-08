import { afterEach, expect, it, vi } from "vitest";
import { previewMedia } from "./media-preview";

const native = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("../bridge", () => native);
afterEach(() => native.invoke.mockReset());

const shrink = vi.fn(async (dataUrl: string, maxSide: number) => ({
  base64: `small:${dataUrl.length}:${maxSide}`,
  width: 512,
  height: 288,
}));

it("returns a small JPEG of a Bible take", async () => {
  native.invoke.mockImplementation(async (command: string, args) =>
    command === "get_bible_variant_image_base64" && args.variantId === "v1"
      ? "data:image/png;base64,AAAA"
      : null,
  );
  expect(await previewMedia({ bible_variant_id: "v1" }, shrink)).toEqual({
    ok: true,
    value: {
      images: [
        { mime_type: "image/jpeg", base64: "small:26:512", width: 512, height: 288 },
      ],
    },
  });
});

it("returns a small JPEG of a shot image take", async () => {
  native.invoke.mockImplementation(async (command: string, args) =>
    command === "get_version_image_base64" && args.versionId === "take-1"
      ? "data:image/png;base64,BBBB"
      : null,
  );
  expect(await previewMedia({ image_take_id: "take-1" }, shrink)).toMatchObject({
    ok: true,
    value: { images: [{ mime_type: "image/jpeg" }] },
  });
});

it("refuses unknown media and ambiguous requests", async () => {
  native.invoke.mockResolvedValue(null);
  expect(await previewMedia({ bible_variant_id: "nope" }, shrink)).toMatchObject({
    ok: false,
    error: { code: "NOT_FOUND" },
  });
  expect(
    await previewMedia({ bible_variant_id: "v1", image_take_id: "t1" }, shrink),
  ).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  expect(await previewMedia({}, shrink)).toMatchObject({
    ok: false,
    error: { code: "INVALID_INPUT" },
  });
});
