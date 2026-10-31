import { expect, it, vi } from "vitest";
import { openTestDb } from "../db.test";
import { createGenerationUsageCommands } from "./generation-usage";
import { createGenerationBillingCommands } from "./generation-billing";

it("reconciles only the matching FAL request using discounted billing events across pages without generating media", async () => {
  const db = openTestDb();
  try {
    db.prepare("INSERT INTO projects(id,name) VALUES ('film','Film')").run();
    const usage = createGenerationUsageCommands(db);
    usage.begin_generation_usage({ request_id: "ours", project_id: "film", provider: "fal", model_id: "flux-dev-fal", kind: "image", estimated_min_microusd: 25000, estimated_max_microusd: 25000 });
    usage.record_generation_receipt({ request_id: "ours", provider_request_id: "fal-job", reported_microusd: null });
    usage.finish_generation_usage({ request_id: "ours", status: "failed" });
    const http = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({
      billing_events: [{ request_id: "fal-job", cost_total: 0.02 }, { request_id: "someone-else", cost_total: 500 }], has_more: true, next_cursor: "next-page",
    }))).mockResolvedValueOnce(new Response(JSON.stringify({
      billing_events: [{ request_id: "fal-job", cost_total: 0.003 }], has_more: false, next_cursor: null,
    })));
    const commands = createGenerationBillingCommands(db, () => "test-key", http);
    expect(await commands.sync_generation_charges({ project_id: "film", request_ids: ["ours"] })).toMatchObject({ ok: true, value: { checked: 1, reported: 1 } });
    expect(usage.get_generation_usage({ project_id: "film" })).toMatchObject({ ok: true, value: { items: [{ reported_microusd: 23000, estimated_min_microusd: 25000, provider_request_id: "fal-job", status: "failed" }] } });
    expect(http).toHaveBeenCalledTimes(2);
    const [url, options] = http.mock.calls[0];
    expect(new URL(String(url)).pathname).toBe("/v1/models/billing-events");
    expect(new URL(String(url)).searchParams.get("request_id")).toBe("fal-job");
    expect(new Headers(options?.headers).get("authorization")).toBe("Key test-key");
    expect(options?.method ?? "GET").toBe("GET");
    expect(await commands.sync_generation_charges({ project_id: "film", request_ids: ["ours"] })).toMatchObject({ ok: true, value: { checked: 0, reported: 0 } });
    expect(http).toHaveBeenCalledTimes(2);
  } finally { db.close(); }
});
