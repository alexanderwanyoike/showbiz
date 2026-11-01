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
    const first = {
      unit: "second",
      kind: "video",
      microusd: 100000,
      resolution: "720p",
      audio: false,
    };
    const second = {
      unit: "second",
      kind: "video",
      microusd: 200000,
      resolution: "1080p",
      audio: true,
    };
    commands.save_generation_price({
      kind: "video",
      price: {
        provider: "fal",
        model_id: "video",
        currency: "USD",
        source_kind: "manual",
        source_url: "",
        checked_at: "2026-11-01T12:00:00Z",
        rates: [first, second],
      },
    });
    expect(
      commands.clear_generation_price({
        model_id: "video",
        kind: "video",
        rate_scope: {
          unit: "second",
          kind: "video",
          resolution: "720p",
          audio: false,
        },
      }),
    ).toMatchObject({ ok: true });
    expect(
      commands.get_generation_price({ model_id: "video", kind: "video" }),
    ).toMatchObject({
      ok: true,
      value: { source_kind: "manual", rates: [second] },
    });
  } finally {
    db.close();
  }
});

it("retains distinct cached prices for different endpoints of the same model and generation kind", () => {
  const db = openTestDb();
  try {
    const commands = createGenerationPricingCommands(db);
    const base = {
      provider: "fal",
      model_id: "veo-3.1-fal",
      currency: "USD",
      source_kind: "provider",
      source_url: "https://api.fal.ai/v1/models/pricing/estimate",
      checked_at: new Date().toISOString(),
      estimate_basis: "historical_request",
    };
    commands.save_generation_price({
      kind: "video",
      price: {
        ...base,
        endpoint_id: "fal-ai/veo3.1/text-to-video",
        rates: [{ unit: "request", microusd: 1000000 }],
      },
    });
    commands.save_generation_price({
      kind: "video",
      price: {
        ...base,
        endpoint_id: "fal-ai/veo3.1/image-to-video",
        rates: [{ unit: "request", microusd: 2000000 }],
      },
    });
    expect(
      commands.get_generation_price({
        kind: "video",
        model_id: base.model_id,
        endpoint_id: "fal-ai/veo3.1/text-to-video",
      }),
    ).toMatchObject({
      ok: true,
      value: {
        endpoint_id: "fal-ai/veo3.1/text-to-video",
        rates: [{ microusd: 1000000 }],
      },
    });
    expect(
      commands.get_generation_price({
        kind: "video",
        model_id: base.model_id,
        endpoint_id: "fal-ai/veo3.1/image-to-video",
      }),
    ).toMatchObject({
      ok: true,
      value: {
        endpoint_id: "fal-ai/veo3.1/image-to-video",
        rates: [{ microusd: 2000000 }],
      },
    });
  } finally {
    db.close();
  }
});

it("rejects a delayed account-specific cache write after its device key changes", async () => {
  const { createSettingsCommands } = await import("./settings");
  const db = openTestDb();
  try {
    const commands = createSettingsCommands(db);
    commands.save_api_key({ provider: "fal", apiKey: "fixture-key-new" });
    expect(
      commands.save_generation_price({
        kind: "image",
        account_key: "fixture-key-old",
        price: {
          provider: "fal",
          model_id: "account-specific-fal",
          currency: "USD",
          source_kind: "provider",
          source_url: "https://api.fal.ai/v1/models/pricing/estimate",
          endpoint_id: "fixture/endpoint",
          checked_at: new Date().toISOString(),
          rates: [{ unit: "request", microusd: 23000 }],
        },
      }),
    ).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(
      commands.get_generation_price({
        kind: "image",
        model_id: "account-specific-fal",
        endpoint_id: "fixture/endpoint",
      }),
    ).toMatchObject({ ok: true, value: null });
  } finally {
    db.close();
  }
});
