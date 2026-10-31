// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { GenerationCost } from "../components/GenerationCost";
const mocks = vi.hoisted(() => ({invoke: vi.fn(), estimate: vi.fn()}));
vi.mock("./bridge", () => ({invoke: mocks.invoke}));
vi.mock("./generation-pricing", () => ({getGenerationEstimate: mocks.estimate}));
afterEach(cleanup);
it("shows a preflight estimate separately from the last provider-reported charge", async () => {
  mocks.estimate.mockResolvedValue({kind: "estimate", min_microusd: 1200000, max_microusd: 1200000, stale: false, excludes_input_cost: false, price: {provider: "openrouter", model_id: "veo-3.1-openrouter", source_url: "https://openrouter.ai", checked_at: "2026-10-31T12:00:00Z", rates: [{unit: "second", microusd: 150000}]}});
  mocks.invoke.mockResolvedValue({ok: true, value: {items: [{kind: "video", model_id: "veo-3.1-openrouter", reported_microusd: 1340000, estimated_min_microusd: 1200000, estimated_max_microusd: 1200000, status: "completed"}], total_count: 1}});
  render(createElement(GenerationCost, {modelId: "veo-3.1-openrouter", request: {kind: "video", duration: "8s", resolution: "720p", audio: true}, subject: {project_id: "film", subject_id: "shot"}}));
  expect((await screen.findByLabelText("Estimated generation cost")).textContent).toContain("~$1.20");
  expect((await screen.findByLabelText("Last generation cost")).textContent).toContain("$1.34 reported");
});
