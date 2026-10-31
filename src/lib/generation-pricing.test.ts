import { expect, it, vi } from "vitest";
import { openTestDb } from "../../electron/db.test";
import { createGenerationPricingCommands } from "../../electron/commands/generation-pricing";
import { getGenerationEstimate } from "./generation-pricing";
const native = vi.hoisted(() => ({invoke: vi.fn(), fetch: vi.fn()}));
vi.mock("./bridge", () => ({invoke: native.invoke}));
vi.mock("./models/http", () => ({fetch: native.fetch}));
it("quotes a sourced image output and fetches a distinct OpenRouter provider rate without generating media", async () => {
  const db = openTestDb();
  try {
    const commands: Record<string, (args?: Record<string, unknown>) => unknown> = createGenerationPricingCommands(db);
    native.invoke.mockImplementation(async (command, args) => commands[command]?.(args));
    expect(await getGenerationEstimate("nano-banana-2", {kind: "image"})).toMatchObject({kind: "estimate", min_microusd: 67200, excludes_input_cost: true});
    native.fetch.mockResolvedValue(new Response(JSON.stringify({endpoints: [{pricing: [{billable: "output_image", unit: "image", cost_usd: 0.04}]}]})));
    expect(await getGenerationEstimate("seedream-4.5-openrouter", {kind: "image"})).toMatchObject({kind: "estimate", min_microusd: 40000, price: {provider: "openrouter"}});
    expect(native.fetch.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/images/models/bytedance-seed/seedream-4.5/endpoints");
    expect(native.fetch.mock.calls[0][1]?.method ?? "GET").toBe("GET");
  } finally { db.close(); }
});
