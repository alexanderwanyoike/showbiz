import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { openTestDb } from "../../../electron/db.test";
import { createTestDataCommands } from "../../../electron/test-support/data-commands";
import { addBibleImage } from "./add-bible-image";

const native = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("../bridge", () => native);

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]).toString("base64");

// The test runs without a browser, so the picture the "browser" decodes is described here.
const picture = { width: 1, height: 1, loads: true, decodes: true };
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  width = 0;
  height = 0;
  naturalWidth = 0;
  naturalHeight = 0;
  set src(_value: string) {
    queueMicrotask(() => {
      if (!picture.loads) return this.onerror?.();
      this.width = this.naturalWidth = picture.width;
      this.height = this.naturalHeight = picture.height;
      this.onload?.();
    });
  }
  decode() {
    return picture.decodes ? Promise.resolve() : Promise.reject(new Error("EncodingError"));
  }
}
beforeEach(() => {
  Object.assign(picture, { width: 1, height: 1, loads: true, decodes: true });
  vi.stubGlobal("Image", FakeImage);
});
afterEach(() => {
  native.invoke.mockReset();
  vi.unstubAllGlobals();
});

function project() {
  const db = openTestDb();
  const commands: Record<string, (args?: Record<string, unknown>) => unknown> = createTestDataCommands(
    db,
    fs.mkdtempSync(path.join(os.tmpdir(), "showbiz-bible-image-")),
  );
  const entryIn = (projectName: string) => {
    const film = commands.create_project({ name: projectName }) as { id: string };
    const [bible] = commands.get_bibles({ projectId: film.id }) as { id: string }[];
    const sock = commands.create_bible_asset({
      bibleId: bible.id,
      input: { asset_type: "character", name: "Sock detective", consent_confirmed: false },
    }) as { id: string };
    return { film, sock };
  };
  const open = entryIn("Skit");
  const other = entryIn("Another film");
  native.invoke.mockImplementation(async (command: string, args) =>
    command === "get_project_document_state"
      ? { ok: true, value: { current: { project_id: open.film.id }, recent: [] } }
      : commands[command]?.(args),
  );
  const pictures = (assetId: string) =>
    commands.get_bible_asset_variants({ assetId }) as {
      id: string;
      name: string;
      source_kind: string;
      status: string;
      is_primary: boolean;
      model_id: string | null;
    }[];
  return { sock: open.sock, elsewhere: other.sock, pictures };
}
const request = (assetId: string, extra: Record<string, unknown> = {}) => ({
  bible_asset_id: assetId,
  mime_type: "image/png",
  base64: PNG,
  ...extra,
});

it("saves the picture as the Bible's upload does, making an entry's first picture current", async () => {
  const { sock, pictures } = project();
  const added = await addBibleImage(request(sock.id, { name: "Sock sketch" }));
  const [saved] = pictures(sock.id);
  expect(added).toEqual({ ok: true, value: { variant_id: saved.id } });
  expect(saved).toMatchObject({
    name: "Sock sketch",
    source_kind: "uploaded",
    status: "approved",
    is_primary: true,
    model_id: null,
  });
});

it("adds later pictures without replacing the current one", async () => {
  const { sock, pictures } = project();
  await addBibleImage(request(sock.id));
  await addBibleImage(request(sock.id, { mime_type: "image/jpeg", base64: JPEG }));
  expect(pictures(sock.id).map((saved) => saved.is_primary)).toEqual([true, false]);
  expect(pictures(sock.id)[1].name).toBe("Uploaded picture");
});

it("only adds pictures to entries in the open project", async () => {
  const { elsewhere, pictures } = project();
  expect(await addBibleImage(request(elsewhere.id))).toMatchObject({
    ok: false,
    error: { code: "NOT_FOUND" },
  });
  expect(await addBibleImage(request("missing"))).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  expect(pictures(elsewhere.id)).toEqual([]);
});

it.each([
  ["will not load", { loads: false }],
  ["will not decode", { decodes: false }],
  ["has too many pixels", { width: 10000, height: 10000 }],
])("refuses a picture that %s without saving anything", async (_label, described) => {
  const { sock, pictures } = project();
  Object.assign(picture, described);
  expect(await addBibleImage(request(sock.id))).toMatchObject({
    ok: false,
    error: { code: "INVALID_INPUT" },
  });
  expect(pictures(sock.id)).toEqual([]);
});

it("checks the bytes again rather than trusting the caller", async () => {
  const { sock, pictures } = project();
  expect(await addBibleImage(request(sock.id, { base64: JPEG }))).toMatchObject({
    ok: false,
    error: { code: "INVALID_INPUT" },
  });
  expect(pictures(sock.id)).toEqual([]);
});
