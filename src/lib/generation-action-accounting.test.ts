import { expect, it, vi } from "vitest";
import { openTestDb } from "../../electron/db.test";
import { createGenerationUsageCommands } from "../../electron/commands/generation-usage";
import { createGenerationPricingCommands } from "../../electron/commands/generation-pricing";
import { generateImageAction } from "../actions/generation-actions";
const mocks = vi.hoisted(() => ({invoke: vi.fn(), fetch: vi.fn()}));
vi.mock("./bridge", () => ({invoke: mocks.invoke}));
vi.mock("./models/http", () => ({fetch: mocks.fetch}));
it("records the estimate and provider receipt for an actual image generation action", async () => {
  const db = openTestDb();
  try {
    db.prepare("INSERT INTO projects(id,name) VALUES ('film','Film')").run();
    const commands: Record<string, (args?: Record<string, unknown>) => unknown> = {...createGenerationUsageCommands(db), ...createGenerationPricingCommands(db)};
    commands.save_generation_price({kind: "image", price: {provider: "openrouter", model_id: "seedream-4.5-openrouter", currency: "USD", source_kind: "manual", source_url: "https://openrouter.ai", checked_at: "2026-10-31T12:00:00Z", rates: [{unit: "image", microusd: 50000}]}});
    mocks.invoke.mockImplementation(async (command, args) => command === "get_api_key" ? "fixture-key" : commands[command]?.(args));
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({id: "image-job", data: [{b64_json: "aA==", media_type: "image/png"}], usage: {cost: 0.04}})));
    expect(await generateImageAction("Morning", "seedream-4.5-openrouter", {project_id: "film", subject_id: "character"})).toBe("data:image/png;base64,aA==");
    expect(commands.get_generation_usage({project_id: "film"})).toMatchObject({ok: true, value: {items: [{kind: "image", subject_id: "character", status: "completed", estimated_min_microusd: 50000, reported_microusd: 40000}]}});
  } finally { db.close(); }
});
