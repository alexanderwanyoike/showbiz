import { expect, it, vi } from "vitest";
import { MAX_BIBLE_IMAGE_BASE64 } from "../../shared/agent-generation";
import { MAX_MESSAGE_BYTES } from "./contract";
import { createMcpSession } from "./session";
import { mcpTools } from "./tools";

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0xff, 0xd9]).toString("base64");
const webp = (riffSize: number) =>
  Buffer.concat([Buffer.from("RIFF"), Buffer.from([riffSize, 0, 0, 0]), Buffer.from("WEBPVP8 ")]).toString("base64");
const WEBP = webp(8);
const cutOff = (base64: string, bytes: number) => Buffer.from(base64, "base64").subarray(0, -bytes).toString("base64");

function app(canEdit = true) {
  const dispatch = vi.fn(async (command: string) =>
    command === "add_bible_image" ? { ok: true, value: { variant_id: "variant-1" } } : {},
  );
  return { dispatch, session: createMcpSession(dispatch, () => {}, () => canEdit) };
}
const request = (args: Record<string, unknown>, requestId = "picture-1") => ({
  tool: "add_bible_image",
  args: {
    bible_asset_id: "sock",
    mime_type: "image/png",
    base64: PNG,
    expected_revision: 0,
    request_id: requestId,
    ...args,
  },
});
const sentToApp = (dispatch: ReturnType<typeof app>["dispatch"]) =>
  dispatch.mock.calls.filter(([command]) => command === "add_bible_image");

it("is a free, guarded edit that the app carries out", () => {
  const tool = mcpTools.find((entry) => entry.name === "add_bible_image");
  expect(tool).toMatchObject({ mutates: true, command: "add_bible_image" });
  expect(tool?.spends).toBeFalsy();
  expect(tool?.openWorld).toBeFalsy();
});

it.each([
  ["a PNG", "image/png", PNG],
  ["a JPEG", "image/jpeg", JPEG],
  ["a WebP", "image/webp", WEBP],
])("hands %s to the app with only the picture's fields", async (_label, mime_type, base64) => {
  const { dispatch, session } = app();
  expect(await session.call(request({ mime_type, base64, name: "Sock sketch" }))).toMatchObject({
    ok: true,
    value: { data: { value: { variant_id: "variant-1" } } },
  });
  expect(sentToApp(dispatch)).toEqual([
    ["add_bible_image", { bible_asset_id: "sock", mime_type, base64, name: "Sock sketch" }],
  ]);
});

it.each([
  ["bytes of another type than declared", { mime_type: "image/png", base64: JPEG }],
  ["bytes that are not an image", { base64: Buffer.from("not a picture at all").toString("base64") }],
  ["an unsupported type", { mime_type: "image/gif", base64: Buffer.from("GIF89a......").toString("base64") }],
  ["a data URL instead of base64", { base64: `data:image/png;base64,${PNG}` }],
  ["a file path", { base64: "/home/someone/sock.png" }],
  ["too many bytes", { base64: `${PNG.slice(0, 12)}${"A".repeat(MAX_BIBLE_IMAGE_BASE64)}` }],
  ["no bytes", { base64: "" }],
  ["a PNG that is cut off", { base64: cutOff(PNG, 4) }],
  ["a JPEG that is cut off", { mime_type: "image/jpeg", base64: cutOff(JPEG, 2) }],
  ["a WebP shorter than it says", { mime_type: "image/webp", base64: webp(12) }],
])("refuses %s before the app sees it", async (_label, args) => {
  const { dispatch, session } = app();
  expect(await session.call(request(args))).toMatchObject({
    ok: false,
    error: { code: "INVALID_INPUT" },
  });
  expect(sentToApp(dispatch)).toEqual([]);
});

it("keeps the largest accepted picture within the bridge's message limit", () => {
  const largest = request({
    bible_asset_id: "x".repeat(200),
    request_id: "r".repeat(200),
    name: "n".repeat(200),
    base64: "A".repeat(MAX_BIBLE_IMAGE_BASE64),
  });
  expect(Buffer.byteLength(JSON.stringify(largest))).toBeLessThanOrEqual(MAX_MESSAGE_BYTES);
});

it("waits for unsaved work in the app and checks the revision", async () => {
  const busy = app(false);
  expect(await busy.session.call(request({}))).toMatchObject({ ok: false, error: { code: "BUSY" } });
  const stale = app();
  expect(await stale.session.call(request({ expected_revision: 3 }))).toMatchObject({
    ok: false,
    error: { code: "CONFLICT" },
  });
  expect([...sentToApp(busy.dispatch), ...sentToApp(stale.dispatch)]).toEqual([]);
});

it("replays a repeated request instead of adding the picture twice", async () => {
  const { dispatch, session } = app();
  const first = await session.call(request({}));
  expect(await session.call(request({}))).toEqual(first);
  expect(sentToApp(dispatch)).toHaveLength(1);
});
