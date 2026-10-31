// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { GenerationCost } from "../components/GenerationCost";
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), estimate: vi.fn() }));
vi.mock("./bridge", () => ({ invoke: mocks.invoke }));
vi.mock("./generation-pricing", () => ({
  getGenerationEstimate: mocks.estimate,
}));
afterEach(cleanup);
it("shows a preflight estimate separately from the last provider-reported charge", async () => {
  mocks.estimate.mockResolvedValue({
    kind: "estimate",
    min_microusd: 1200000,
    max_microusd: 1200000,
    stale: false,
    excludes_input_cost: false,
    price: {
      provider: "openrouter",
      model_id: "veo-3.1-openrouter",
      source_url: "https://openrouter.ai",
      checked_at: "2026-10-31T12:00:00Z",
      rates: [{ unit: "second", microusd: 150000 }],
    },
  });
  mocks.invoke.mockResolvedValue({
    ok: true,
    value: {
      items: [
        {
          kind: "video",
          model_id: "veo-3.1-openrouter",
          reported_microusd: 1340000,
          estimated_min_microusd: 1200000,
          estimated_max_microusd: 1200000,
          status: "completed",
        },
      ],
      total_count: 1,
    },
  });
  render(
    createElement(GenerationCost, {
      modelId: "veo-3.1-openrouter",
      request: {
        kind: "video",
        duration: "8s",
        resolution: "720p",
        audio: true,
      },
      subject: { project_id: "film", subject_id: "shot" },
    }),
  );
  expect(
    (await screen.findByLabelText("Estimated generation cost")).textContent,
  ).toContain("~$1.20");
  expect(
    (await screen.findByLabelText("Last generation cost")).textContent,
  ).toContain("$1.34 reported");
});
it("keeps a newly generated picture's charge visible before a reference retake", async () => {
  mocks.estimate.mockResolvedValue({ kind: "unavailable", reason: "No rate" });
  mocks.invoke.mockResolvedValue({
    ok: true,
    value: {
      items: [
        {
          kind: "image",
          model_id: "seedream-4.5-openrouter",
          reported_microusd: 40000,
          status: "completed",
        },
      ],
      total_count: 1,
    },
  });
  render(
    createElement(GenerationCost, {
      modelId: "seedream-4.5-openrouter",
      request: { kind: "image_compose" },
      subject: { project_id: "film", subject_id: "character" },
    }),
  );
  expect(
    (await screen.findByLabelText("Last generation cost")).textContent,
  ).toContain("$0.04 reported");
});
it("distinguishes a published snapshot from live API pricing and opens device-wide model pricing explicitly", async () => {
  const { default: userEvent } = await import("@testing-library/user-event");
  mocks.estimate.mockResolvedValue({ kind: "estimate", min_microusd: 39000, max_microusd: 39000, stale: false, excludes_input_cost: true, price: { provider: "gemini", model_id: "nano-banana", currency: "USD", source_kind: "published", source_url: "https://ai.google.dev/gemini-api/docs/pricing", checked_at: "2026-10-31T12:00:00Z", rates: [{ unit: "image", microusd: 39000 }] } });
  render(createElement(GenerationCost, { modelId: "nano-banana", request: { kind: "image" } }));
  const user = userEvent.setup();
  await user.click(await screen.findByText("Rate details"));
  expect(screen.getByText("Published price snapshot")).toBeTruthy();
  expect(screen.queryByText("Set your rate")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Model pricing…" }));
  expect(screen.getByRole("dialog", { name: "Model pricing" })).toBeTruthy();
  expect(screen.getByText(/applies to this model on this device across all projects/)).toBeTruthy();
});
it("names the generation type and video settings affected by a device-wide rate", async () => {
  const { default: userEvent } = await import("@testing-library/user-event");
  mocks.estimate.mockResolvedValue({ kind: "unavailable", reason: "No quote" });
  mocks.invoke.mockResolvedValue({ ok: true, value: null });
  render(createElement(GenerationCost, { modelId: "veo-3.1-openrouter", request: { kind: "video", duration: "8s", resolution: "720p", audio: true } }));
  await userEvent.setup().click(screen.getByRole("button", { name: "Model pricing…" }));
  expect(screen.getByText("Video · 720p · Audio on")).toBeTruthy();
});
it("cancels a staged custom rate with Escape without a second confirmation", async () => {
  const { default: userEvent } = await import("@testing-library/user-event");
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  mocks.estimate.mockResolvedValue({ kind: "unavailable", reason: "No quote" });
  mocks.invoke.mockResolvedValue({ ok: true, value: null });
  render(createElement(GenerationCost, { modelId: "veo-3.1-openrouter", request: { kind: "video", duration: "8s" } }));
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Model pricing…" }));
  await user.type(screen.getByLabelText("USD per second"), "0.13");
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog", { name: "Model pricing" })).toBeNull();
  expect(confirm).not.toHaveBeenCalled();
  confirm.mockRestore();
});
