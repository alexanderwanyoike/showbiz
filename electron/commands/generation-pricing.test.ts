import { expect, it } from "vitest";
import { openTestDb } from "../db.test";
import { createGenerationPricingCommands } from "./generation-pricing";
it("keeps device price overrides separate from bundled provider rates and restores the provider basis on reset", () => {
  const db = openTestDb();
  try {
    const commands = createGenerationPricingCommands(db);
    expect(commands.get_generation_price({model_id: "nano-banana-2", kind: "image"})).toMatchObject({ok: true, value: {provider: "gemini", rates: [{unit: "image", microusd: 67200}]}});
    const price = {provider: "gemini", model_id: "nano-banana-2", currency: "USD", source_kind: "manual", source_url: "https://ai.google.dev/gemini-api/docs/pricing", checked_at: "2026-10-31T12:00:00Z", rates: [{unit: "image", microusd: 50000}]};
    expect(commands.save_generation_price({kind: "image", price})).toMatchObject({ok: true});
    expect(createGenerationPricingCommands(db).get_generation_price({model_id: "nano-banana-2", kind: "image"})).toMatchObject({ok: true, value: {source_kind: "manual", rates: [{microusd: 50000}]}});
    expect(commands.clear_generation_price({model_id: "nano-banana-2", kind: "image"})).toMatchObject({ok: true});
    expect(commands.get_generation_price({model_id: "nano-banana-2", kind: "image"})).toMatchObject({ok: true, value: {rates: [{microusd: 67200}]}});
    expect(commands.get_generation_price({model_id: "local-image", kind: "image"})).toMatchObject({ok: true, value: null});
  } finally { db.close(); }
});
