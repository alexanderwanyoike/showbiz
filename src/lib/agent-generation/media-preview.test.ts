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

it("never passes file system details from a failed read to the agent", async () => {
  native.invoke.mockRejectedValue(
    new Error("Failed to read file: EACCES /home/someone/.cache/showbiz/media/secret.png"),
  );
  const result = await previewMedia({ bible_variant_id: "v1" }, shrink);
  expect(result).toEqual({
    ok: false,
    error: { code: "IO_ERROR", message: "That picture could not be read." },
  });
});

it("returns three frames of a video take: start, middle and end", async () => {
  native.invoke.mockImplementation(async (command: string, args) =>
    command === "get_video_versions" && args.shotId === undefined
      ? null
      : command === "get_video_version_path" && args.versionId === "video-1"
        ? "videos/shot-1_v1.mp4"
        : null,
  );
  const frames = vi.fn(async () => ["data:image/jpeg;base64,A", "data:image/jpeg;base64,B", "data:image/jpeg;base64,C"]);
  const result = await previewMedia({ video_take_id: "video-1" }, shrink, frames);
  expect(frames).toHaveBeenCalledWith("videos/shot-1_v1.mp4", 3);
  expect(result).toMatchObject({ ok: true, value: { images: [{}, {}, {}] } });
  expect(await previewMedia({ video_take_id: "nope" }, shrink, frames)).toMatchObject({
    ok: false,
    error: { code: "NOT_FOUND" },
  });
});
