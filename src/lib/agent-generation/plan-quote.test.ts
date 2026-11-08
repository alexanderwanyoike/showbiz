import { afterEach, expect, it, vi } from "vitest";
import { openTestDb } from "../../../electron/db.test";
import { createTestDataCommands } from "../../../electron/test-support/data-commands";
import { createGenerationPricingCommands } from "../../../electron/commands/generation-pricing";
import { getGenerationEstimate } from "../generation-pricing";
import { planAgentQuote } from "./plan-quote";
import { IMAGE_GENERATION_REQUEST } from "../../../shared/generation-cost";

const native = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("../bridge", () => native);
afterEach(() => native.invoke.mockReset());

function project() {
  const db = openTestDb();
  const commands: Record<string, (args?: Record<string, unknown>) => unknown> = {
    ...createTestDataCommands(db, "/unused"),
    ...createGenerationPricingCommands(db),
  };
  const film = commands.create_project({ name: "Skit" }) as { id: string };
  const [bible] = commands.get_bibles({ projectId: film.id }) as { id: string }[];
  const asset = commands.create_bible_asset({
    bibleId: bible.id,
    input: {
      asset_type: "character",
      name: "Sock detective",
      consent_confirmed: false,
    },
  }) as { id: string };
  native.invoke.mockImplementation(async (command: string, args) =>
    command === "get_project_document_state"
      ? { ok: true, value: { current: { project_id: film.id }, recent: [] } }
      : commands[command]?.(args),
  );
  return { commands, film, asset };
}
const request = (overrides: Record<string, string> = {}) => ({
  target: "bible_asset" as const,
  operation: "generate" as const,
  asset_id: "missing",
  prompt: "A sock puppet detective in a trench coat",
  model_id: "local-image",
  ...overrides,
});

it("plans a bible image with the estimate the app shows for the same model", async () => {
  const { commands, film, asset } = project();
  commands.save_generation_price({
    kind: "image",
    price: {
      provider: "local",
      model_id: "local-image",
      currency: "USD",
      source_kind: "manual",
      source_url: "",
      checked_at: "2026-11-08T10:00:00.000Z",
      rates: [{ unit: "image", microusd: 0 }],
    },
  });
  const planned = await planAgentQuote(request({ asset_id: asset.id }));
  expect(planned).toEqual({
    ok: true,
    value: {
      model_id: "local-image",
      provider: "local",
      cost_request: IMAGE_GENERATION_REQUEST,
      subject: { project_id: film.id, subject_id: asset.id },
      estimate: await getGenerationEstimate("local-image", IMAGE_GENERATION_REQUEST),
    },
  });
  expect(planned.ok && planned.value.estimate).toMatchObject({
    kind: "estimate",
    max_microusd: 0,
  });
});

it("reports a missing price as unavailable rather than free", async () => {
  const { asset } = project();
  expect(await planAgentQuote(request({ asset_id: asset.id }))).toMatchObject({
    ok: true,
    value: { estimate: { kind: "unavailable" } },
  });
});

it("refuses unknown models and Bible entries outside the open project", async () => {
  const { asset } = project();
  expect(
    await planAgentQuote(request({ asset_id: asset.id, model_id: "veo-3.1-fal" })),
  ).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  expect(await planAgentQuote(request())).toMatchObject({
    ok: false,
    error: { code: "NOT_FOUND" },
  });
});

it("leaves composed frames to frame composition", async () => {
  const { commands } = project();
  const [bible] = commands.get_bibles({
    projectId: (commands.get_projects() as { id: string }[])[0].id,
  }) as { id: string }[];
  const frame = commands.create_bible_asset({
    bibleId: bible.id,
    input: { asset_type: "reference", name: "Office at night", consent_confirmed: false },
  }) as { id: string };
  expect(await planAgentQuote(request({ asset_id: frame.id }))).toMatchObject({
    ok: false,
    error: { code: "INVALID_INPUT" },
  });
});

it("needs an open project", async () => {
  native.invoke.mockImplementation(async () => ({
    ok: true,
    value: { current: null, recent: [] },
  }));
  expect(await planAgentQuote(request())).toMatchObject({
    ok: false,
    error: { code: "UNAVAILABLE" },
  });
});
