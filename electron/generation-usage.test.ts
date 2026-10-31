import { expect, it } from "vitest";
import { openTestDb } from "./db.test";
import { createGenerationUsageCommands } from "./commands/generation-usage";
it("retains the preflight estimate and reported cost as distinct values across completion", () => {
  const db = openTestDb();
  try {
    db.prepare("INSERT INTO projects(id,name) VALUES ('film','Film')").run();
    const commands = createGenerationUsageCommands(db);
    const started = commands.begin_generation_usage({
      request_id: "request",
      project_id: "film",
      kind: "video",
      provider: "openrouter",
      model_id: "veo",
      estimated_min_microusd: 1200000,
      estimated_max_microusd: 1200000,
      settings: { duration: 8, resolution: "720p" },
      price_source: "https://openrouter.ai/models/veo",
      price_checked_at: "2026-10-31T12:00:00Z",
    });
    expect(started).toMatchObject({ ok: true });
    expect(
      commands.record_generation_receipt({
        request_id: "request",
        reported_microusd: 1340000,
        provider_request_id: "provider-job",
      }),
    ).toMatchObject({ ok: true });
    expect(
      commands.finish_generation_usage({
        request_id: "request",
        status: "completed",
      }),
    ).toMatchObject({ ok: true });
    expect(commands.get_generation_usage({ project_id: "film" })).toMatchObject(
      {
        ok: true,
        value: {
          items: [
            {
              request_id: "request",
              estimated_min_microusd: 1200000,
              reported_microusd: 1340000,
              provider_request_id: "provider-job",
              status: "completed",
            },
          ],
        },
      },
    );
    expect(
      commands.get_generation_cost_summary({ project_id: "film" }),
    ).toMatchObject({
      ok: true,
      value: {
        reported_microusd: 1340000,
        estimated_min_microusd: 0,
        unknown_count: 0,
        total_count: 1,
      },
    });
  } finally {
    db.close();
  }
});

it("keeps known charges after failure, treats absent charges as unknown and survives reopening", () => {
  const db = openTestDb();
  try {
    db.prepare("INSERT INTO projects(id,name) VALUES ('film','Film')").run();
    const commands = createGenerationUsageCommands(db);
    const begin = (request_id: string) =>
      commands.begin_generation_usage({
        request_id,
        project_id: "film",
        kind: "image",
        provider: "local",
        model_id: "sdxl",
      });
    expect(begin("failed")).toMatchObject({ ok: true });
    expect(
      commands.record_generation_receipt({
        request_id: "failed",
        reported_microusd: 0,
      }),
    ).toMatchObject({ ok: true });
    expect(
      commands.finish_generation_usage({
        request_id: "failed",
        status: "failed",
      }),
    ).toMatchObject({ ok: true });
    expect(begin("abandoned")).toMatchObject({ ok: true });
    const reopened = createGenerationUsageCommands(db);
    expect(reopened.get_generation_usage({ project_id: "film" })).toMatchObject(
      {
        ok: true,
        value: {
          items: expect.arrayContaining([
            expect.objectContaining({
              request_id: "abandoned",
              status: "interrupted",
              reported_microusd: null,
            }),
          ]),
        },
      },
    );
    expect(
      reopened.get_generation_cost_summary({ project_id: "film" }),
    ).toMatchObject({
      ok: true,
      value: { reported_microusd: 0, unknown_count: 1, total_count: 2 },
    });
    expect(
      reopened.record_generation_receipt({
        request_id: "failed",
        reported_microusd: -1,
      }),
    ).toMatchObject({ ok: false });
  } finally {
    db.close();
  }
});

it("pages usage without changing totals and rejects private fields in stored settings", () => {
  const db = openTestDb();
  try {
    db.prepare("INSERT INTO projects(id,name) VALUES ('film','Film')").run();
    const commands = createGenerationUsageCommands(db);
    for (const request_id of ["a", "b", "c"]) {
      expect(
        commands.begin_generation_usage({
          request_id,
          project_id: "film",
          kind: "image",
          provider: "fal",
          model_id: "image",
          estimated_min_microusd: 40000,
          estimated_max_microusd: 50000,
        }),
      ).toMatchObject({ ok: true });
    }
    const page = commands.get_generation_usage({
      project_id: "film",
      limit: 1,
      offset: 1,
    });
    expect(page).toMatchObject({
      ok: true,
      value: { items: [expect.any(Object)], total_count: 3 },
    });
    if (page.ok) expect(page.value.items).toHaveLength(1);
    expect(
      commands.get_generation_cost_summary({ project_id: "film" }),
    ).toMatchObject({
      ok: true,
      value: {
        estimated_min_microusd: 120000,
        estimated_max_microusd: 150000,
        total_count: 3,
      },
    });
    expect(
      commands.begin_generation_usage({
        request_id: "secret",
        project_id: "film",
        kind: "image",
        provider: "fal",
        model_id: "image",
        settings: { api_key: "secret" },
      }),
    ).toMatchObject({ ok: false });
  } finally {
    db.close();
  }
});

it("preserves the quoted price basis and scopes receipts to their shot", () => {
  const db = openTestDb();
  try {
    db.prepare("INSERT INTO projects(id,name) VALUES ('film','Film')").run();
    const commands = createGenerationUsageCommands(db);
    const price = { provider: "fal", model_id: "image", currency: "USD", source_url: "https://fal.ai", checked_at: "2026-10-31T12:00:00Z", rates: [{ unit: "image", microusd: 40000 }] };
    expect(commands.begin_generation_usage({request_id: "quoted", project_id: "film", subject_id: "shot-a", kind: "image", provider: "fal", model_id: "image", estimated_min_microusd: 40000, estimated_max_microusd: 40000, price_basis: price})).toMatchObject({ok: true});
    expect(commands.get_generation_usage({project_id: "film", subject_id: "shot-b"})).toMatchObject({ok: true, value: {items: [], total_count: 0}});
    expect(commands.get_generation_usage({project_id: "film", subject_id: "shot-a"})).toMatchObject({ok: true, value: {items: [{subject_id: "shot-a", price_basis: price}]}});
  } finally { db.close(); }
});
