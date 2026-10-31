import { expect, it, vi } from "vitest";
import { openTestDb } from "../../electron/db.test";
import { createGenerationUsageCommands } from "../../electron/commands/generation-usage";
import { runAccountedGeneration } from "./generation-accounting";
const native = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("./bridge", () => native);
it("starts accounting before generation and preserves a charge when media delivery fails", async () => {
  const db = openTestDb();
  try {
    db.prepare("INSERT INTO projects(id,name) VALUES ('film','Film')").run();
    const commands: Record<
      string,
      (args?: Record<string, unknown>) => unknown
    > = createGenerationUsageCommands(db);
    native.invoke.mockImplementation(async (command, args) =>
      commands[command](args),
    );
    const price = {
      provider: "openrouter",
      model_id: "veo",
      currency: "USD" as const,
      source_url: "https://openrouter.ai",
      checked_at: "2026-10-31T12:00:00Z",
      rates: [{ unit: "second" as const, microusd: 150000 }],
    };
    const result = await runAccountedGeneration(
      {
        project_id: "film",
        subject_id: "shot",
        provider: "openrouter",
        model_id: "veo",
        kind: "video",
        settings: { duration: 8 },
      },
      {
        kind: "estimate",
        min_microusd: 1200000,
        max_microusd: 1200000,
        price,
        stale: false,
        excludes_input_cost: false,
      },
      async (observer) => {
        expect(
          commands.get_generation_usage({ project_id: "film" }),
        ).toMatchObject({
          ok: true,
          value: {
            items: [{ status: "running", estimated_min_microusd: 1200000 }],
          },
        });
        await observer.receipt({
          reported_microusd: 1340000,
          provider_request_id: "job",
        });
        throw new Error("Media download failed");
      },
    );
    expect(result).toMatchObject({
      ok: false,
      error: { message: "Media download failed" },
    });
    expect(commands.get_generation_usage({ project_id: "film" })).toMatchObject(
      {
        ok: true,
        value: {
          items: [
            {
              status: "failed",
              reported_microusd: 1340000,
              subject_id: "shot",
              price_basis: price,
            },
          ],
        },
      },
    );
    expect(
      commands.get_generation_cost_summary({ project_id: "film" }),
    ).toMatchObject({
      ok: true,
      value: { reported_microusd: 1340000, estimated_min_microusd: 0 },
    });
  } finally {
    db.close();
  }
});
