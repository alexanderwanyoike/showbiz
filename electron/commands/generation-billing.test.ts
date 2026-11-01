import { expect, it, vi } from "vitest";
import { openTestDb } from "../db.test";
import { createGenerationUsageCommands } from "./generation-usage";
import { createGenerationBillingCommands } from "./generation-billing";

it("reconciles only the matching FAL request using discounted billing events across pages without generating media", async () => {
  const db = openTestDb();
  try {
    db.prepare("INSERT INTO projects(id,name) VALUES ('film','Film')").run();
    const usage = createGenerationUsageCommands(db);
    usage.begin_generation_usage({
      request_id: "ours",
      project_id: "film",
      provider: "fal",
      model_id: "flux-dev-fal",
      kind: "image",
      estimated_min_microusd: 25000,
      estimated_max_microusd: 25000,
    });
    usage.record_generation_receipt({
      request_id: "ours",
      provider_request_id: "fal-job",
      reported_microusd: null,
    });
    usage.finish_generation_usage({ request_id: "ours", status: "failed" });
    const http = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            billing_events: [
              { request_id: "fal-job", cost_total: 0.02 },
              { request_id: "someone-else", cost_total: 500 },
            ],
            has_more: true,
            next_cursor: "next-page",
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            billing_events: [{ request_id: "fal-job", cost_total: 0.003 }],
            has_more: false,
            next_cursor: null,
          }),
        ),
      );
    const commands = createGenerationBillingCommands(
      db,
      () => "test-key",
      http,
    );
    expect(
      await commands.sync_generation_charges({
        project_id: "film",
        request_ids: ["ours"],
      }),
    ).toMatchObject({ ok: true, value: { checked: 1, reported: 1 } });
    expect(usage.get_generation_usage({ project_id: "film" })).toMatchObject({
      ok: true,
      value: {
        items: [
          {
            reported_microusd: 23000,
            estimated_min_microusd: 25000,
            provider_request_id: "fal-job",
            status: "failed",
          },
        ],
      },
    });
    expect(http).toHaveBeenCalledTimes(2);
    const [url, options] = http.mock.calls[0];
    expect(new URL(String(url)).pathname).toBe("/v1/models/billing-events");
    expect(new URL(String(url)).searchParams.get("request_id")).toBe("fal-job");
    expect(new Headers(options?.headers).get("authorization")).toBe(
      "Key test-key",
    );
    expect(options?.method ?? "GET").toBe("GET");
    expect(
      await commands.sync_generation_charges({
        project_id: "film",
        request_ids: ["ours"],
      }),
    ).toMatchObject({ ok: true, value: { checked: 0, reported: 0 } });
    expect(http).toHaveBeenCalledTimes(2);
  } finally {
    db.close();
  }
});
it("reads a delayed OpenRouter video charge through its generation ID and preserves an actual zero", async () => {
  const db = openTestDb();
  try {
    db.prepare("INSERT INTO projects(id,name) VALUES ('film','Film')").run();
    const usage = createGenerationUsageCommands(db);
    usage.begin_generation_usage({
      request_id: "ours",
      project_id: "film",
      provider: "openrouter",
      model_id: "veo-3.1-openrouter",
      kind: "video",
    });
    usage.record_generation_receipt({
      request_id: "ours",
      provider_request_id: "job-1",
      reported_microusd: null,
    });
    usage.finish_generation_usage({ request_id: "ours", status: "completed" });
    const http = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "job-1",
            status: "completed",
            generation_id: "gen-1",
            usage: {},
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { id: "gen-1", total_cost: 0 } })),
      );
    const commands = createGenerationBillingCommands(
      db,
      () => "test-key",
      http,
    );
    expect(
      await commands.sync_generation_charges({ project_id: "film" }),
    ).toMatchObject({ ok: true, value: { reported: 1 } });
    expect(String(http.mock.calls[0][0])).toBe(
      "https://openrouter.ai/api/v1/videos/job-1",
    );
    expect(String(http.mock.calls[1][0])).toBe(
      "https://openrouter.ai/api/v1/generation?id=gen-1",
    );
    expect(usage.get_generation_usage({ project_id: "film" })).toMatchObject({
      ok: true,
      value: {
        items: [{ reported_microusd: 0, provider_request_id: "job-1" }],
      },
    });
  } finally {
    db.close();
  }
});
it.each(["denied", "pending", "malformed", "partial"])(
  "keeps the preflight estimate unconfirmed when FAL billing is %s",
  async (scenario) => {
    const db = openTestDb();
    try {
      db.prepare("INSERT INTO projects(id,name) VALUES ('film','Film')").run();
      const usage = createGenerationUsageCommands(db);
      usage.begin_generation_usage({
        request_id: "ours",
        project_id: "film",
        provider: "fal",
        model_id: "flux",
        kind: "image",
        estimated_min_microusd: 25000,
        estimated_max_microusd: 25000,
      });
      usage.record_generation_receipt({
        request_id: "ours",
        provider_request_id: "fal-job",
        reported_microusd: null,
      });
      usage.finish_generation_usage({
        request_id: "ours",
        status: "completed",
      });
      const http = vi.fn<typeof fetch>();
      if (scenario === "denied")
        http.mockResolvedValue(new Response("denied", { status: 403 }));
      else if (scenario === "pending")
        http.mockResolvedValue(
          new Response(
            JSON.stringify({
              billing_events: [],
              has_more: false,
              next_cursor: null,
            }),
          ),
        );
      else if (scenario === "malformed")
        http.mockResolvedValue(
          new Response(
            JSON.stringify({
              billing_events: [{ request_id: "fal-job", cost_total: "bad" }],
              has_more: false,
              next_cursor: null,
            }),
          ),
        );
      else
        http
          .mockResolvedValueOnce(
            new Response(
              JSON.stringify({
                billing_events: [{ request_id: "fal-job", cost_total: 0.02 }],
                has_more: true,
                next_cursor: "more",
              }),
            ),
          )
          .mockResolvedValueOnce(new Response("unavailable", { status: 500 }));
      const key = vi.fn((provider: string) =>
        provider === "fal-billing" ? "billing-only-key" : "inference-key",
      );
      const commands = createGenerationBillingCommands(db, key, http);
      expect(
        await commands.sync_generation_charges({ project_id: "film" }),
      ).toMatchObject({
        ok: true,
        value: {
          reported: 0,
          notes: [
            expect.objectContaining({
              request_id: "ours",
              message: expect.any(String),
            }),
          ],
        },
      });
      expect(
        new Headers(http.mock.calls[0][1]?.headers).get("authorization"),
      ).toBe("Key billing-only-key");
      expect(usage.get_generation_usage({ project_id: "film" })).toMatchObject({
        ok: true,
        value: {
          items: [{ reported_microusd: null, estimated_min_microusd: 25000 }],
        },
      });
    } finally {
      db.close();
    }
  },
);
it("does not fetch charges for a different project's request", async () => {
  const db = openTestDb();
  try {
    db.prepare(
      "INSERT INTO projects(id,name) VALUES ('film','Film'),('other','Other')",
    ).run();
    const usage = createGenerationUsageCommands(db);
    usage.begin_generation_usage({
      request_id: "other-request",
      project_id: "other",
      provider: "fal",
      model_id: "flux",
      kind: "image",
    });
    usage.record_generation_receipt({
      request_id: "other-request",
      provider_request_id: "fal-job",
      reported_microusd: null,
    });
    usage.finish_generation_usage({
      request_id: "other-request",
      status: "completed",
    });
    const http = vi.fn<typeof fetch>();
    expect(
      await createGenerationBillingCommands(
        db,
        () => "key",
        http,
      ).sync_generation_charges({
        project_id: "film",
        request_ids: ["other-request"],
      }),
    ).toMatchObject({ ok: true, value: { checked: 0 } });
    expect(http).not.toHaveBeenCalled();
  } finally {
    db.close();
  }
});

it("counts only charges actually written when another receipt arrives during lookup", async () => {
  const db = openTestDb();
  try {
    db.prepare("INSERT INTO projects(id,name) VALUES ('film','Film')").run();
    const usage = createGenerationUsageCommands(db);
    usage.begin_generation_usage({
      request_id: "ours",
      project_id: "film",
      provider: "fal",
      model_id: "flux-dev-fal",
      kind: "image",
    });
    usage.record_generation_receipt({
      request_id: "ours",
      provider_request_id: "fixture-job",
      reported_microusd: null,
    });
    usage.finish_generation_usage({ request_id: "ours", status: "completed" });
    const http = vi.fn<typeof fetch>().mockImplementation(async () => {
      usage.record_generation_receipt({
        request_id: "ours",
        provider_request_id: "fixture-job",
        reported_microusd: 17000,
      });
      return new Response(
        JSON.stringify({
          billing_events: [{ request_id: "fixture-job", cost_total: 0.02 }],
          has_more: false,
          next_cursor: null,
        }),
      );
    });
    const commands = createGenerationBillingCommands(
      db,
      () => "fixture-key",
      http,
    );
    expect(
      await commands.sync_generation_charges({ project_id: "film" }),
    ).toMatchObject({ ok: true, value: { checked: 1, reported: 0 } });
    expect(usage.get_generation_usage({ project_id: "film" })).toMatchObject({
      ok: true,
      value: { items: [{ reported_microusd: 17000 }] },
    });
  } finally {
    db.close();
  }
});

it("backs off unconfirmed checks, preserves their reason, and retries on explicit refresh or credential changes", async () => {
  const db = openTestDb();
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date("2026-11-01T12:00:00Z"));
    db.prepare("INSERT INTO projects(id,name) VALUES ('film','Film')").run();
    const usage = createGenerationUsageCommands(db);
    usage.begin_generation_usage({
      request_id: "ours",
      project_id: "film",
      provider: "fal",
      model_id: "flux-dev-fal",
      kind: "image",
    });
    usage.record_generation_receipt({
      request_id: "ours",
      provider_request_id: "fixture-job",
      reported_microusd: null,
    });
    usage.finish_generation_usage({ request_id: "ours", status: "completed" });
    let key = "fixture-key-a";
    const http = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response("denied", { status: 403 }));
    const commands = createGenerationBillingCommands(db, () => key, http);
    const first = await commands.sync_generation_charges({
      project_id: "film",
    });
    expect(first).toMatchObject({ ok: true, value: { checked: 1 } });
    const cached = await commands.sync_generation_charges({
      project_id: "film",
    });
    expect(cached).toMatchObject({
      ok: true,
      value: {
        checked: 0,
        reported: 0,
        notes: [
          {
            request_id: "ours",
            message: expect.stringContaining("access denied"),
          },
        ],
      },
    });
    expect(http).toHaveBeenCalledTimes(1);
    await commands.sync_generation_charges({ project_id: "film", force: true });
    expect(http).toHaveBeenCalledTimes(2);
    key = "fixture-key-b";
    await commands.sync_generation_charges({ project_id: "film" });
    expect(http).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(60001);
    await commands.sync_generation_charges({ project_id: "film" });
    expect(http).toHaveBeenCalledTimes(4);
  } finally {
    vi.useRealTimers();
    db.close();
  }
});

it("shares an in-flight check for the same project request selection", async () => {
  const db = openTestDb();
  const replies: ((value: Response) => void)[] = [];
  let checks: Promise<unknown>[] = [];
  try {
    db.prepare("INSERT INTO projects(id,name) VALUES ('film','Film')").run();
    const usage = createGenerationUsageCommands(db);
    usage.begin_generation_usage({
      request_id: "ours",
      project_id: "film",
      provider: "fal",
      model_id: "flux-dev-fal",
      kind: "image",
    });
    usage.record_generation_receipt({
      request_id: "ours",
      provider_request_id: "fixture-job",
      reported_microusd: null,
    });
    usage.finish_generation_usage({ request_id: "ours", status: "completed" });
    const http = vi
      .fn<typeof fetch>()
      .mockImplementation(
        () => new Promise<Response>((resolve) => replies.push(resolve)),
      );
    const commands = createGenerationBillingCommands(
      db,
      () => "fixture-key",
      http,
    );
    checks = [
      commands.sync_generation_charges({
        project_id: "film",
        request_ids: ["ours"],
      }),
      commands.sync_generation_charges({
        project_id: "film",
        request_ids: ["ours"],
        force: true,
      }),
    ];
    expect(http).toHaveBeenCalledTimes(1);
  } finally {
    for (const reply of replies)
      reply(
        new Response(
          JSON.stringify({
            billing_events: [],
            has_more: false,
            next_cursor: null,
          }),
        ),
      );
    await Promise.all(checks);
    db.close();
  }
});
it("retains only a credential fingerprint in billing cooldown entries", async () => {
  const { createHash } = await import("node:crypto");
  const db = openTestDb();
  const writes = vi.spyOn(Map.prototype, "set");
  try {
    db.prepare(
      "INSERT INTO projects(id,name) VALUES ('fingerprint','Film')",
    ).run();
    const usage = createGenerationUsageCommands(db);
    usage.begin_generation_usage({
      request_id: "fingerprint-request",
      project_id: "fingerprint",
      provider: "fal",
      model_id: "flux",
      kind: "image",
    });
    usage.record_generation_receipt({
      request_id: "fingerprint-request",
      provider_request_id: "job",
      reported_microusd: null,
    });
    usage.finish_generation_usage({
      request_id: "fingerprint-request",
      status: "completed",
    });
    const secret = "test-only-credential-not-for-retention";
    const commands = createGenerationBillingCommands(
      db,
      () => secret,
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("denied", { status: 403 })),
    );
    expect(
      await commands.sync_generation_charges({ project_id: "fingerprint" }),
    ).toMatchObject({ ok: true });
    const retained = writes.mock.calls
      .map(([, value]) => value)
      .filter(
        (value) =>
          value &&
          typeof value === "object" &&
          "until" in value &&
          "message" in value,
      );
    expect(retained).toHaveLength(1);
    expect(JSON.stringify(retained)).not.toContain(secret);
    expect(retained[0]).toMatchObject({
      credential_id: createHash("sha256").update(secret).digest("hex"),
    });
  } finally {
    writes.mockRestore();
    db.close();
  }
});
