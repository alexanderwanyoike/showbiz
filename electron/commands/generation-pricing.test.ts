import { expect, it } from "vitest";
import { openTestDb } from "../db.test";
import { createGenerationPricingCommands } from "./generation-pricing";
it("keeps device price overrides separate from bundled provider rates and restores the provider basis on reset", () => {
  const db = openTestDb();
  try {
    const commands = createGenerationPricingCommands(db);
    expect(
      commands.get_generation_price({
        model_id: "nano-banana-2",
        kind: "image",
      }),
    ).toMatchObject({
      ok: true,
      value: {
        provider: "gemini",
        rates: [{ unit: "image", microusd: 67200 }],
      },
    });
    const price = {
      provider: "gemini",
      model_id: "nano-banana-2",
      currency: "USD",
      source_kind: "manual",
      source_url: "https://ai.google.dev/gemini-api/docs/pricing",
      checked_at: "2026-10-31T12:00:00Z",
      rates: [{ unit: "image", microusd: 50000 }],
    };
    expect(
      commands.save_generation_price({ kind: "image", price }),
    ).toMatchObject({ ok: true });
    expect(
      createGenerationPricingCommands(db).get_generation_price({
        model_id: "nano-banana-2",
        kind: "image",
      }),
    ).toMatchObject({
      ok: true,
      value: { source_kind: "manual", rates: [{ microusd: 50000 }] },
    });
    expect(
      commands.clear_generation_price({
        model_id: "nano-banana-2",
        kind: "image",
        rate_scope: { unit: "image" },
      }),
    ).toMatchObject({ ok: true });
    expect(
      commands.get_generation_price({
        model_id: "nano-banana-2",
        kind: "image",
      }),
    ).toMatchObject({ ok: true, value: { rates: [{ microusd: 67200 }] } });
    expect(
      commands.get_generation_price({ model_id: "local-image", kind: "image" }),
    ).toMatchObject({ ok: true, value: null });
  } finally {
    db.close();
  }
});
it("retains manual rates for other output settings when one setting is updated", () => {
  const db = openTestDb();
  try {
    const commands = createGenerationPricingCommands(db);
    const base = {
      provider: "fal",
      model_id: "video",
      currency: "USD",
      source_kind: "manual",
      source_url: "",
      checked_at: "2026-10-31T12:00:00Z",
    };
    commands.save_generation_price({
      kind: "video",
      price: {
        ...base,
        rates: [
          {
            unit: "second",
            microusd: 200000,
            resolution: "720p",
            audio: false,
          },
        ],
      },
    });
    commands.save_generation_price({
      kind: "video",
      price: {
        ...base,
        rates: [
          {
            unit: "second",
            microusd: 400000,
            resolution: "1080p",
            audio: true,
          },
        ],
      },
    });
    expect(
      commands.get_generation_price({ model_id: "video", kind: "video" }),
    ).toMatchObject({
      ok: true,
      value: {
        rates: expect.arrayContaining([
          expect.objectContaining({ resolution: "720p", microusd: 200000 }),
          expect.objectContaining({ resolution: "1080p", microusd: 400000 }),
        ]),
      },
    });
  } finally {
    db.close();
  }
});


it("removes only the selected custom setting and retains other saved facets", () => {
  const db = openTestDb();
  try {
    const commands = createGenerationPricingCommands(db);
    const first = { unit: "second", kind: "video", microusd: 100000, resolution: "720p", audio: false };
    const second = { unit: "second", kind: "video", microusd: 200000, resolution: "1080p", audio: true };
    commands.save_generation_price({ kind: "video", price: { provider: "fal", model_id: "video", currency: "USD", source_kind: "manual", source_url: "", checked_at: "2026-11-01T12:00:00Z", rates: [first, second] } });
    expect(commands.clear_generation_price({ model_id: "video", kind: "video", rate_scope: { unit: "second", kind: "video", resolution: "720p", audio: false } })).toMatchObject({ ok: true });
    expect(commands.get_generation_price({ model_id: "video", kind: "video" })).toMatchObject({ ok: true, value: { source_kind: "manual", rates: [second] } });
  } finally { db.close(); }
});
