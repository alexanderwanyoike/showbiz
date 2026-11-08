import { expect, it } from "vitest";
import { createAgentQuotes } from "../agent-generation/quotes";
import { createMcpSession } from "./session";
import { mcpTools } from "./tools";

it("quotes a generation through MCP without changing project data", async () => {
  const quotes = createAgentQuotes({
    budget: async () => ({
      ok: true,
      value: {
        grant: {
          id: "grant",
          max_microusd: 1_000_000,
          per_request_cap_microusd: 1_000_000,
          allowed_models: null,
          granted_at: "2026-11-08T09:00:00.000Z",
          expires_at: "2099-01-01T00:00:00.000Z",
          revoked_at: null,
        },
        committed_microusd: 0,
        remaining_microusd: 1_000_000,
        frozen: false,
      },
    }),
    plan: async () => ({
      ok: true,
      value: {
        model_id: "local-image",
        provider: "local",
        cost_request: { kind: "image", count: 1 },
        subject: { project_id: "film", subject_id: "asset-1" },
        estimate: {
          kind: "estimate",
          min_microusd: 0,
          max_microusd: 0,
          price: {
            provider: "local",
            model_id: "local-image",
            currency: "USD",
            source_kind: "manual",
            source_url: "",
            checked_at: "2026-11-08T09:00:00.000Z",
            rates: [{ unit: "image", microusd: 0 }],
          },
          stale: false,
          excludes_input_cost: false,
        },
      },
    }),
  });
  const tool = mcpTools.find((entry) => entry.name === "quote_generation");
  expect(tool).toMatchObject({ mutates: false, command: "quote_generation" });
  expect(tool?.requestTimeoutMs).toBeGreaterThan(60_000);
  const session = createMcpSession(async (command, args) =>
    command === "quote_generation" ? quotes.quote_generation(args) : undefined,
  );
  expect(
    await session.call({
      tool: "quote_generation",
      args: {
        target: "bible_asset",
        operation: "generate",
        asset_id: "asset-1",
        prompt: "A sock puppet detective",
        model_id: "local-image",
      },
    }),
  ).toMatchObject({
    ok: true,
    value: {
      revision: 0,
      data: { ok: true, value: { max_microusd: 0, model_id: "local-image" } },
    },
  });
});
