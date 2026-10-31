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
it("quotes Nano Banana image output tokens as a routing range without claiming input charges are included", async () => {
  const db = openTestDb();
  try {
    const commands: Record<string, (args?: Record<string, unknown>) => unknown> = createGenerationPricingCommands(db);
    native.invoke.mockImplementation(async (command, args) => commands[command]?.(args));
    native.fetch.mockResolvedValue(new Response(JSON.stringify({endpoints: [{pricing: [{billable: "output_image", unit: "token", cost_usd: 0.00006}]}, {pricing: [{billable: "output_image", unit: "token", cost_usd: 0.000066}]}]})));
    expect(await getGenerationEstimate("nano-banana-2-openrouter", {kind: "image"})).toMatchObject({kind: "estimate", min_microusd: 67200, max_microusd: 73920, excludes_input_cost: true});
  } finally { db.close(); }
});
it("updates video estimates for duration, resolution and audio, including Auto ranges", async () => {
  const db = openTestDb();
  try {
    const commands: Record<string, (args?: Record<string, unknown>) => unknown> = createGenerationPricingCommands(db);
    native.invoke.mockImplementation(async (command, args) => commands[command]?.(args));
    native.fetch.mockResolvedValue(new Response(JSON.stringify({data: [{id: "google/veo-3.1", supported_resolutions: ["720p", "1080p", "4K"], supported_durations: [4, 6, 8], pricing_skus: {duration_seconds_with_audio: "0.40", duration_seconds_without_audio: "0.20", duration_seconds_with_audio_4k: "0.60", duration_seconds_without_audio_4k: "0.40"}}]})));
    expect(await getGenerationEstimate("veo-3.1-openrouter", {kind: "video", duration: "8s", resolution: "1080p", audio: false})).toMatchObject({kind: "estimate", min_microusd: 1600000, max_microusd: 1600000});
    expect(await getGenerationEstimate("veo-3.1-openrouter", {kind: "video", duration: "8s", resolution: "4K", audio: true})).toMatchObject({kind: "estimate", min_microusd: 4800000});
    expect(await getGenerationEstimate("veo-3.1-openrouter", {kind: "video", duration: "auto", resolution: "720p", audio: true})).toMatchObject({kind: "estimate", min_microusd: 1600000, max_microusd: 3200000});
  } finally { db.close(); }
});
it("refreshes a stale provider snapshot without reusing its old verification date", async () => {
  const db = openTestDb();
  try {
    const commands: Record<string, (args?: Record<string, unknown>) => unknown> = createGenerationPricingCommands(db);
    native.invoke.mockImplementation(async (command, args) => commands[command]?.(args));
    commands.save_generation_price({kind: "image", price: {provider: "openrouter", model_id: "seedream-4.5-openrouter", currency: "USD", source_url: "https://openrouter.ai", checked_at: "2020-01-01T00:00:00Z", rates: [{unit: "image", microusd: 40000}]}});
    native.fetch.mockResolvedValue(new Response(JSON.stringify({endpoints: [{pricing: [{billable: "output_image", unit: "image", cost_usd: 0.05}]}]})));
    expect(await getGenerationEstimate("seedream-4.5-openrouter", {kind: "image"})).toMatchObject({kind: "estimate", min_microusd: 50000, stale: false});
  } finally { db.close(); }
});
it("shares a provider rate lookup across simultaneous generation controls", async () => {
 const db=openTestDb();try{
 const commands:Record<string,(args?:Record<string,unknown>)=>unknown>=createGenerationPricingCommands(db);
 native.invoke.mockImplementation(async(command,args)=>commands[command]?.(args));
 native.fetch.mockClear();native.fetch.mockImplementation(async()=>new Response(JSON.stringify({endpoints:[{pricing:[{billable:"output_image",unit:"image",cost_usd:0.04}]}]})));
 const results=await Promise.all([getGenerationEstimate("seedream-4.5-openrouter",{kind:"image"}),getGenerationEstimate("seedream-4.5-openrouter",{kind:"image"})]);
 expect(results.every(result=>result.kind==="estimate")).toBe(true);
 expect(native.fetch).toHaveBeenCalledTimes(1);
 }finally{db.close();}
});
