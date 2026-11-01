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
it("checks the actual provider charge after generation ends without hiding saved media when billing is denied", async () => {
  const db = openTestDb();
  try {
    db.prepare("INSERT INTO projects(id,name) VALUES ('film','Film')").run();
    const usage = createGenerationUsageCommands(db);
    const sync = vi.fn(async () => ({ ok: true, value: { checked: 1, reported: 0, notes: [{ request_id: "request", message: "Billing access denied" }] } }));
    const commands: Record<string, (args?: Record<string, unknown>) => unknown> = { ...usage, sync_generation_charges: sync };
    native.invoke.mockImplementation(async (command, args) => commands[command](args));
    const result = await runAccountedGeneration({ project_id: "film", provider: "fal", model_id: "flux-dev-fal", kind: "image", settings: {} }, { kind: "unavailable", reason: "No quote" }, async (observer) => {
      await observer.receipt({ provider_request_id: "provider-job", reported_microusd: null });
      return "saved-media";
    });
    expect(result).toEqual({ ok: true, value: "saved-media" });
    expect(sync).toHaveBeenCalledOnce();
    expect(usage.get_generation_usage({ project_id: "film" })).toMatchObject({ ok: true, value: { items: [{ status: "completed", provider_request_id: "provider-job", reported_microusd: null }] } });
  } finally { db.close(); }
});

it("returns generated media with an explicit warning when saving its receipt fails", async () => {
  const db = openTestDb();
  try {
    db.prepare("INSERT INTO projects(id,name) VALUES ('film','Film')").run();
    const commands: Record<string, (args?: Record<string, unknown>) => unknown> = createGenerationUsageCommands(db);
    native.invoke.mockImplementation(async (command: string, args?: Record<string, unknown>) => command === "record_generation_receipt"
      ? { ok: false, error: { code: "IO_ERROR", message: "The receipt database is unavailable." } }
      : commands[command](args));
    const result = await runAccountedGeneration({ project_id: "film", provider: "openrouter", model_id: "image", kind: "image", settings: {} }, { kind: "unavailable", reason: "No quote" }, async (observer) => {
      await observer.receipt({ provider_request_id: "paid-job", reported_microusd: 23000 });
      return "generated-picture";
    });
    expect(result).toMatchObject({ ok: true, value: "generated-picture", warnings: [expect.stringContaining("The receipt database is unavailable.")] });
    expect(commands.get_generation_usage({ project_id: "film" })).toMatchObject({ ok: true, value: { items: [{ status: "completed", reported_microusd: null }] } });
  } finally { db.close(); }
});

it.each(["result", "exception"])("keeps successful media when finishing usage fails through a %s", async (failureMode) => {
  const db = openTestDb();
  try {
    db.prepare("INSERT INTO projects(id,name) VALUES ('film','Film')").run();
    const commands: Record<string, (args?: Record<string, unknown>) => unknown> = createGenerationUsageCommands(db);
    native.invoke.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
      if (command !== "finish_generation_usage") return commands[command](args);
      if (failureMode === "exception") throw new Error("Usage IPC disconnected.");
      return { ok: false, error: { code: "IO_ERROR", message: "Usage outcome could not be saved." } };
    });
    expect(await runAccountedGeneration({ project_id: "film", provider: "local", model_id: "local-image", kind: "image", settings: {} }, { kind: "unavailable", reason: "Unknown compute cost" }, async () => "generated-picture")).toMatchObject({ ok: true, value: "generated-picture", warnings: [expect.stringContaining("usage outcome")] });
  } finally { db.close(); }
});
