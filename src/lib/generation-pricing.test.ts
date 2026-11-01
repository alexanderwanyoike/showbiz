import { expect, it, vi } from "vitest";
import { openTestDb } from "../../electron/db.test";
import { createGenerationPricingCommands } from "../../electron/commands/generation-pricing";
import { getGenerationEstimate } from "./generation-pricing";
const native = vi.hoisted(() => ({ invoke: vi.fn(), fetch: vi.fn() }));
vi.mock("./bridge", () => ({ invoke: native.invoke }));
vi.mock("./models/http", () => ({ fetch: native.fetch }));
it("quotes a sourced image output and fetches a distinct OpenRouter provider rate without generating media", async () => {
  const db = openTestDb();
  try {
    const commands: Record<
      string,
      (args?: Record<string, unknown>) => unknown
    > = createGenerationPricingCommands(db);
    native.invoke.mockImplementation(async (command, args) =>
      commands[command]?.(args),
    );
    expect(
      await getGenerationEstimate("nano-banana-2", { kind: "image" }),
    ).toMatchObject({
      kind: "estimate",
      min_microusd: 67200,
      excludes_input_cost: true,
    });
    native.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          endpoints: [
            {
              pricing: [
                { billable: "output_image", unit: "image", cost_usd: 0.04 },
              ],
            },
          ],
        }),
      ),
    );
    expect(
      await getGenerationEstimate("seedream-4.5-openrouter", { kind: "image" }),
    ).toMatchObject({
      kind: "estimate",
      min_microusd: 40000,
      price: { provider: "openrouter" },
    });
    expect(native.fetch.mock.calls[0][0]).toBe(
      "https://openrouter.ai/api/v1/images/models/bytedance-seed/seedream-4.5/endpoints",
    );
    expect(native.fetch.mock.calls[0][1]?.method ?? "GET").toBe("GET");
  } finally {
    db.close();
  }
});
it("quotes Nano Banana image output tokens as a routing range without claiming input charges are included", async () => {
  const db = openTestDb();
  try {
    const commands: Record<
      string,
      (args?: Record<string, unknown>) => unknown
    > = createGenerationPricingCommands(db);
    native.invoke.mockImplementation(async (command, args) =>
      commands[command]?.(args),
    );
    native.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          endpoints: [
            {
              pricing: [
                { billable: "output_image", unit: "token", cost_usd: 0.00006 },
              ],
            },
            {
              pricing: [
                { billable: "output_image", unit: "token", cost_usd: 0.000066 },
              ],
            },
          ],
        }),
      ),
    );
    expect(
      await getGenerationEstimate("nano-banana-2-openrouter", {
        kind: "image",
      }),
    ).toMatchObject({
      kind: "estimate",
      min_microusd: 67200,
      max_microusd: 73920,
      excludes_input_cost: true,
    });
  } finally {
    db.close();
  }
});
it("updates video estimates for duration, resolution and audio, including Auto ranges", async () => {
  const db = openTestDb();
  try {
    const commands: Record<
      string,
      (args?: Record<string, unknown>) => unknown
    > = createGenerationPricingCommands(db);
    native.invoke.mockImplementation(async (command, args) =>
      commands[command]?.(args),
    );
    native.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: "google/veo-3.1",
              supported_resolutions: ["720p", "1080p", "4K"],
              supported_durations: [4, 6, 8],
              pricing_skus: {
                duration_seconds_with_audio: "0.40",
                duration_seconds_without_audio: "0.20",
                duration_seconds_with_audio_4k: "0.60",
                duration_seconds_without_audio_4k: "0.40",
              },
            },
          ],
        }),
      ),
    );
    expect(
      await getGenerationEstimate("veo-3.1-openrouter", {
        kind: "video",
        duration: "8s",
        resolution: "1080p",
        audio: false,
      }),
    ).toMatchObject({
      kind: "estimate",
      min_microusd: 1600000,
      max_microusd: 1600000,
    });
    expect(
      await getGenerationEstimate("veo-3.1-openrouter", {
        kind: "video",
        duration: "8s",
        resolution: "4K",
        audio: true,
      }),
    ).toMatchObject({ kind: "estimate", min_microusd: 4800000 });
    expect(
      await getGenerationEstimate("veo-3.1-openrouter", {
        kind: "video",
        duration: "auto",
        resolution: "720p",
        audio: true,
      }),
    ).toMatchObject({
      kind: "estimate",
      min_microusd: 1600000,
      max_microusd: 3200000,
    });
  } finally {
    db.close();
  }
});
it("refreshes a stale provider snapshot without reusing its old verification date", async () => {
  const db = openTestDb();
  try {
    const commands: Record<
      string,
      (args?: Record<string, unknown>) => unknown
    > = createGenerationPricingCommands(db);
    native.invoke.mockImplementation(async (command, args) =>
      commands[command]?.(args),
    );
    commands.save_generation_price({
      kind: "image",
      price: {
        provider: "openrouter",
        model_id: "seedream-4.5-openrouter",
        currency: "USD",
        source_url: "https://openrouter.ai",
        checked_at: "2020-01-01T00:00:00Z",
        rates: [{ unit: "image", microusd: 40000 }],
      },
    });
    native.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          endpoints: [
            {
              pricing: [
                { billable: "output_image", unit: "image", cost_usd: 0.05 },
              ],
            },
          ],
        }),
      ),
    );
    expect(
      await getGenerationEstimate("seedream-4.5-openrouter", { kind: "image" }),
    ).toMatchObject({ kind: "estimate", min_microusd: 50000, stale: false });
  } finally {
    db.close();
  }
});
it("shares a provider rate lookup across simultaneous generation controls", async () => {
  const db = openTestDb();
  try {
    const commands: Record<
      string,
      (args?: Record<string, unknown>) => unknown
    > = createGenerationPricingCommands(db);
    native.invoke.mockImplementation(async (command, args) =>
      commands[command]?.(args),
    );
    native.fetch.mockClear();
    native.fetch.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            endpoints: [
              {
                pricing: [
                  { billable: "output_image", unit: "image", cost_usd: 0.04 },
                ],
              },
            ],
          }),
        ),
    );
    const results = await Promise.all([
      getGenerationEstimate("seedream-4.5-openrouter", { kind: "image" }),
      getGenerationEstimate("seedream-4.5-openrouter", { kind: "image" }),
    ]);
    expect(results.every((result) => result.kind === "estimate")).toBe(true);
    expect(native.fetch).toHaveBeenCalledTimes(1);
  } finally {
    db.close();
  }
});
it("gets account-specific FAL pricing and a historical estimate for the actual edit endpoint without submitting generation", async () => {
  const db = openTestDb();
  try {
    const commands: Record<
      string,
      (args?: Record<string, unknown>) => unknown
    > = createGenerationPricingCommands(db);
    native.invoke.mockImplementation(async (command, args) =>
      command === "get_api_key" ? "test-fal-key" : commands[command]?.(args),
    );
    native.fetch.mockClear();
    native.fetch.mockImplementation(
      async (url: string, init?: RequestInit) =>
        new Response(
          JSON.stringify(
            init?.method === "POST"
              ? {
                  estimate_type: "historical_api_price",
                  total_cost: 0.18,
                  currency: "USD",
                }
              : {
                  prices: [
                    {
                      endpoint_id: "openai/gpt-image-2/edit",
                      unit_price: 0.1,
                      unit: "image",
                      currency: "USD",
                    },
                  ],
                  has_more: false,
                  next_cursor: null,
                },
          ),
        ),
    );
    expect(
      await getGenerationEstimate("gpt-image-2", { kind: "image_edit" }),
    ).toMatchObject({
      kind: "estimate",
      min_microusd: 180000,
      price: {
        source_kind: "provider",
        estimate_basis: "historical_request",
        endpoint_id: "openai/gpt-image-2/edit",
        billing_unit: "image",
        billing_unit_microusd: 100000,
      },
    });
    expect(native.fetch).toHaveBeenCalledTimes(2);
    const [pricingUrl, pricingInit] = native.fetch.mock.calls[0];
    expect(pricingUrl).toBe(
      "https://api.fal.ai/v1/models/pricing?endpoint_id=openai%2Fgpt-image-2%2Fedit",
    );
    expect(pricingInit.headers.Authorization).toBe("Key test-fal-key");
    const [estimateUrl, estimateInit] = native.fetch.mock.calls[1];
    expect(estimateUrl).toBe("https://api.fal.ai/v1/models/pricing/estimate");
    expect(JSON.parse(estimateInit.body)).toEqual({
      estimate_type: "historical_api_price",
      endpoints: { "openai/gpt-image-2/edit": { call_quantity: 1 } },
    });
  } finally {
    db.close();
  }
});
it("fetches the separate FAL first-last-frame endpoint for a video with an end frame", async () => {
  const db = openTestDb();
  try {
    const commands: Record<
      string,
      (args?: Record<string, unknown>) => unknown
    > = createGenerationPricingCommands(db);
    native.invoke.mockImplementation(async (command, args) =>
      command === "get_api_key" ? "test-fal-key" : commands[command]?.(args),
    );
    native.fetch.mockClear();
    native.fetch.mockImplementation(
      async (_url: string, init?: RequestInit) =>
        new Response(
          JSON.stringify(
            init?.method === "POST"
              ? {
                  estimate_type: "historical_api_price",
                  total_cost: 1.5,
                  currency: "USD",
                }
              : {
                  prices: [
                    {
                      endpoint_id: "fal-ai/veo3.1/first-last-frame-to-video",
                      unit_price: 0.4,
                      unit: "second",
                      currency: "USD",
                    },
                  ],
                },
          ),
        ),
    );
    expect(
      await getGenerationEstimate("veo-3.1-fal", {
        kind: "video",
        mode: "image-to-video",
        has_end_frame: true,
        duration: "8s",
        resolution: "720p",
        audio: true,
      }),
    ).toMatchObject({
      kind: "estimate",
      price: { endpoint_id: "fal-ai/veo3.1/first-last-frame-to-video" },
    });
    expect(String(native.fetch.mock.calls[0][0])).toContain(
      "first-last-frame-to-video",
    );
  } finally {
    db.close();
  }
});
it("shares an authenticated FAL price lookup across simultaneous controls", async () => {
  const db = openTestDb();
  try {
    const commands: Record<
      string,
      (args?: Record<string, unknown>) => unknown
    > = createGenerationPricingCommands(db);
    native.invoke.mockImplementation(async (command, args) =>
      command === "get_api_key" ? "test-fal-key" : commands[command]?.(args),
    );
    native.fetch.mockClear();
    native.fetch.mockImplementation(
      async (_url: string, init?: RequestInit) =>
        new Response(
          JSON.stringify(
            init?.method === "POST"
              ? {
                  estimate_type: "historical_api_price",
                  total_cost: 0.18,
                  currency: "USD",
                }
              : {
                  prices: [
                    {
                      endpoint_id: "openai/gpt-image-2",
                      unit_price: 0.1,
                      unit: "image",
                      currency: "USD",
                    },
                  ],
                },
          ),
        ),
    );
    const results = await Promise.all([
      getGenerationEstimate("gpt-image-2", { kind: "image" }),
      getGenerationEstimate("gpt-image-2", { kind: "image" }),
    ]);
    expect(results.every((result) => result.kind === "estimate")).toBe(true);
    expect(native.fetch).toHaveBeenCalledTimes(2);
  } finally {
    db.close();
  }
});
it("marks an older cached OpenRouter rate unconfirmed when a live refresh fails", async () => {
  const db = openTestDb();
  try {
    const commands: Record<
      string,
      (args?: Record<string, unknown>) => unknown
    > = createGenerationPricingCommands(db);
    native.invoke.mockImplementation(async (command, args) =>
      commands[command]?.(args),
    );
    commands.save_generation_price({
      kind: "image",
      price: {
        provider: "openrouter",
        model_id: "seedream-4.5-openrouter",
        currency: "USD",
        source_kind: "provider",
        source_url:
          "https://openrouter.ai/api/v1/images/models/bytedance-seed/seedream-4.5/endpoints",
        checked_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        rates: [{ unit: "image", microusd: 40000 }],
      },
    });
    native.fetch.mockClear();
    native.fetch.mockResolvedValue(
      new Response("unavailable", { status: 503 }),
    );
    expect(
      await getGenerationEstimate("seedream-4.5-openrouter", { kind: "image" }),
    ).toMatchObject({ kind: "estimate", min_microusd: 40000, stale: true });
    expect(native.fetch).toHaveBeenCalledOnce();
  } finally {
    db.close();
  }
});
it("quotes Veo from the live catalog when unrelated video editing models have no resolution list", async () => {
  const db = openTestDb();
  try {
    const commands: Record<
      string,
      (args?: Record<string, unknown>) => unknown
    > = createGenerationPricingCommands(db);
    native.invoke.mockImplementation(async (command, args) =>
      commands[command]?.(args),
    );
    native.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: "black-forest-labs/flux-video-edit",
              supported_resolutions: null,
              pricing_skus: { cents_per_second_output: "3" },
            },
            {
              id: "google/veo-3.1",
              supported_resolutions: ["720p", "1080p", "4K"],
              pricing_skus: {
                duration_seconds_with_audio: "0.40",
                duration_seconds_without_audio: "0.20",
                duration_seconds_with_audio_4k: "0.60",
                duration_seconds_without_audio_4k: "0.40",
              },
            },
          ],
        }),
      ),
    );
    expect(
      await getGenerationEstimate("veo-3.1-openrouter", {
        kind: "video",
        duration: "8s",
        resolution: "720p",
        audio: true,
      }),
    ).toMatchObject({
      kind: "estimate",
      min_microusd: 3200000,
      max_microusd: 3200000,
    });
  } finally {
    db.close();
  }
});

it("falls back to provider pricing for settings without a matching custom rate and preserves its source", async () => {
  const db = openTestDb();
  try {
    const commands: Record<
      string,
      (args?: Record<string, unknown>) => unknown
    > = createGenerationPricingCommands(db);
    native.invoke.mockImplementation(async (command, args) =>
      commands[command]?.(args),
    );
    const base = {
      provider: "openrouter",
      model_id: "veo-3.1-openrouter",
      currency: "USD",
      checked_at: new Date().toISOString(),
    };
    commands.save_generation_price({
      kind: "video",
      price: {
        ...base,
        source_kind: "provider",
        source_url: "https://openrouter.ai/api/v1/videos/models",
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
    commands.save_generation_price({
      kind: "video",
      price: {
        ...base,
        source_kind: "manual",
        source_url: "",
        rates: [
          {
            unit: "second",
            kind: "video",
            microusd: 100000,
            resolution: "720p",
            audio: false,
          },
        ],
      },
    });
    expect(
      await getGenerationEstimate("veo-3.1-openrouter", {
        kind: "video",
        duration: "8s",
        resolution: "720p",
        audio: false,
      }),
    ).toMatchObject({
      kind: "estimate",
      min_microusd: 800000,
      price: { source_kind: "manual" },
    });
    expect(
      await getGenerationEstimate("veo-3.1-openrouter", {
        kind: "video",
        duration: "8s",
        resolution: "1080p",
        audio: true,
      }),
    ).toMatchObject({
      kind: "estimate",
      min_microusd: 3200000,
      price: { source_kind: "provider" },
    });
  } finally {
    db.close();
  }
});

it("retains a matching expired FAL cache as an explicitly stale estimate when live pricing fails", async () => {
  const { createSettingsCommands } = await import("../../electron/commands/settings");
  const db = openTestDb();
  try {
    const commands: Record<string, (args?: Record<string, unknown>) => unknown> = createSettingsCommands(db);
    commands.save_api_key({ provider: "fal", apiKey: "fixture-key" });
    native.invoke.mockImplementation(async (command, args) => commands[command]?.(args));
    commands.save_generation_price({ kind: "image", price: { provider: "fal", model_id: "flux-dev-fal", currency: "USD", source_kind: "provider", source_url: "https://api.fal.ai/v1/models/pricing/estimate", checked_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), endpoint_id: "fal-ai/flux/dev", estimate_basis: "historical_request", rates: [{ unit: "request", microusd: 23000 }] } });
    native.fetch.mockImplementation(async () => new Response("Provider unavailable", { status: 503 }));
    expect(await getGenerationEstimate("flux-dev-fal", { kind: "image" })).toMatchObject({ kind: "estimate", min_microusd: 23000, stale: true, price: { endpoint_id: "fal-ai/flux/dev" } });
  } finally { db.close(); }
});
