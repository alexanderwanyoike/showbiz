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
  mocks.estimate.mockResolvedValue({
    kind: "estimate",
    min_microusd: 39000,
    max_microusd: 39000,
    stale: false,
    excludes_input_cost: true,
    price: {
      provider: "gemini",
      model_id: "nano-banana",
      currency: "USD",
      source_kind: "published",
      source_url: "https://ai.google.dev/gemini-api/docs/pricing",
      checked_at: "2026-10-31T12:00:00Z",
      rates: [{ unit: "image", microusd: 39000 }],
    },
  });
  render(
    createElement(GenerationCost, {
      modelId: "nano-banana",
      request: { kind: "image" },
    }),
  );
  const user = userEvent.setup();
  await user.click(await screen.findByText("Rate details"));
  expect(screen.getByText("Published price snapshot")).toBeTruthy();
  expect(screen.queryByText("Set your rate")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Model pricing…" }));
  expect(screen.getByRole("dialog", { name: "Model pricing" })).toBeTruthy();
  expect(
    screen.getByText(
      /applies to this model on this device across all projects/,
    ),
  ).toBeTruthy();
});
it("names the generation type and video settings affected by a device-wide rate", async () => {
  const { default: userEvent } = await import("@testing-library/user-event");
  mocks.estimate.mockResolvedValue({ kind: "unavailable", reason: "No quote" });
  mocks.invoke.mockResolvedValue({ ok: true, value: null });
  render(
    createElement(GenerationCost, {
      modelId: "veo-3.1-openrouter",
      request: {
        kind: "video",
        duration: "8s",
        resolution: "720p",
        audio: true,
      },
    }),
  );
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Model pricing…" }));
  expect(screen.getByText("Video · 720p · Audio on")).toBeTruthy();
});
it("cancels a staged custom rate with Escape without a second confirmation", async () => {
  const { default: userEvent } = await import("@testing-library/user-event");
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  mocks.estimate.mockResolvedValue({ kind: "unavailable", reason: "No quote" });
  mocks.invoke.mockResolvedValue({ ok: true, value: null });
  render(
    createElement(GenerationCost, {
      modelId: "veo-3.1-openrouter",
      request: { kind: "video", duration: "8s" },
    }),
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Model pricing…" }));
  await user.type(screen.getByLabelText("USD per second"), "0.13");
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog", { name: "Model pricing" })).toBeNull();
  expect(confirm).not.toHaveBeenCalled();
  confirm.mockRestore();
});
it("keeps the last subject request visible when a different model is selected for future generation", async () => {
  mocks.estimate.mockResolvedValue({ kind: "unavailable", reason: "No quote" });
  mocks.invoke.mockResolvedValue({
    ok: true,
    value: {
      items: [
        {
          request_id: "last-request",
          provider: "openrouter",
          model_id: "seedream-4.5-openrouter",
          kind: "image_edit",
          status: "failed",
          reported_microusd: 40000,
        },
      ],
    },
  });
  const subject = { project_id: "film", subject_id: "character" };
  const view = render(
    createElement(GenerationCost, {
      modelId: "seedream-4.5-openrouter",
      request: { kind: "image" },
      subject,
    }),
  );
  expect(
    (await screen.findByLabelText("Last generation cost")).textContent,
  ).toContain("$0.04 reported");
  view.rerender(
    createElement(GenerationCost, {
      modelId: "nano-banana-2",
      request: { kind: "image" },
      subject,
    }),
  );
  expect(
    (await screen.findByLabelText("Last generation cost")).textContent,
  ).toContain("Last request:");
  expect(screen.getByText("Seedream 4.5")).toBeTruthy();
  expect(screen.getByText("OpenRouter")).toBeTruthy();
  expect(screen.getByText("Failed")).toBeTruthy();
  expect(screen.getByText("Image edit")).toBeTruthy();
});
it("does not hide recorded history while a future pricing change is being calculated", async () => {
  const { act } = await import("@testing-library/react");
  mocks.estimate.mockResolvedValue({ kind: "unavailable", reason: "No quote" });
  mocks.invoke.mockResolvedValue({
    ok: true,
    value: {
      items: [
        {
          request_id: "last",
          provider: "openrouter",
          model_id: "veo-3.1-openrouter",
          kind: "video",
          status: "completed",
          reported_microusd: 3200000,
        },
      ],
    },
  });
  render(
    createElement(GenerationCost, {
      modelId: "veo-3.1-openrouter",
      request: { kind: "video" },
      subject: { project_id: "film", subject_id: "shot" },
    }),
  );
  expect(
    (await screen.findByLabelText("Last generation cost")).textContent,
  ).toContain("$3.20 reported");
  mocks.invoke.mockImplementation(() => new Promise(() => {}));
  await act(async () => {
    window.dispatchEvent(new Event("showbiz:pricing-changed"));
  });
  expect(screen.getByLabelText("Last generation cost").textContent).toContain(
    "$3.20 reported",
  );
});

it("shows accounting warnings beside the affected generation while keeping its media result", async () => {
  const { act, within } = await import("@testing-library/react");
  const { runAccountedGeneration } = await import("./generation-accounting");
  mocks.estimate.mockResolvedValue({ kind: "unavailable", reason: "No quote" });
  mocks.invoke.mockImplementation(async (command: string) =>
    command === "record_generation_receipt"
      ? {
          ok: false,
          error: { code: "IO_ERROR", message: "Receipt could not be written." },
        }
      : { ok: true, value: { items: [] } },
  );
  render(
    createElement(
      "div",
      null,
      createElement(
        "section",
        { "aria-label": "Affected shot" },
        createElement(GenerationCost, {
          modelId: "seedream-4.5-openrouter",
          request: { kind: "image" },
          subject: { project_id: "film", subject_id: "shot" },
        }),
      ),
      createElement(
        "section",
        { "aria-label": "Other shot" },
        createElement(GenerationCost, {
          modelId: "seedream-4.5-openrouter",
          request: { kind: "image" },
          subject: { project_id: "film", subject_id: "other" },
        }),
      ),
    ),
  );
  await act(async () => {
    const result = await runAccountedGeneration(
      {
        project_id: "film",
        subject_id: "shot",
        provider: "openrouter",
        model_id: "image",
        kind: "image",
        settings: {},
      },
      { kind: "unavailable", reason: "No quote" },
      async (observer) => {
        await observer.receipt({
          reported_microusd: 23000,
          provider_request_id: "fixture-job",
        });
        return "generated-picture";
      },
    );
    expect(result).toMatchObject({ ok: true, value: "generated-picture" });
  });
  expect(
    await within(
      screen.getByRole("region", { name: "Affected shot" }),
    ).findByText(/Receipt could not be written/),
  ).toBeTruthy();
  expect(
    within(screen.getByRole("region", { name: "Other shot" })).queryByText(
      /Receipt could not be written/,
    ),
  ).toBeNull();
});

it("does not replace a newer request's cost warning with an older background check", async () => {
  const { act } = await import("@testing-library/react");
  mocks.estimate.mockResolvedValue({ kind: "unavailable", reason: "No quote" });
  mocks.invoke.mockResolvedValue({ ok: true, value: { items: [] } });
  render(
    createElement(GenerationCost, {
      modelId: "seedream-4.5-openrouter",
      request: { kind: "image" },
      subject: { project_id: "film", subject_id: "shot" },
    }),
  );
  await act(async () => {
    window.dispatchEvent(
      new CustomEvent("showbiz:usage-changed", {
        detail: {
          project_id: "film",
          subject_id: "shot",
          request_id: "new-request",
          started: true,
          warnings: [],
        },
      }),
    );
    window.dispatchEvent(
      new CustomEvent("showbiz:usage-changed", {
        detail: {
          project_id: "film",
          subject_id: "shot",
          request_id: "old-request",
          started: false,
          warnings: ["Old request billing is pending."],
        },
      }),
    );
  });
  expect(screen.queryByText("Old request billing is pending.")).toBeNull();
});

it.each([
  ["live", "Live provider API pricing"],
  ["cached", "Cached provider API pricing"],
  ["stale", "Cached provider API pricing (refresh unavailable)"],
])(
  "labels %s provider pricing according to the actual lookup outcome",
  async (freshness, label) => {
    const { default: userEvent } = await import("@testing-library/user-event");
    mocks.estimate.mockResolvedValue({
      kind: "estimate",
      min_microusd: 40000,
      max_microusd: 40000,
      stale: freshness === "stale",
      price_freshness: freshness,
      excludes_input_cost: false,
      price: {
        provider: "openrouter",
        model_id: "seedream-4.5-openrouter",
        currency: "USD",
        source_kind: "provider",
        source_url:
          "https://openrouter.ai/api/v1/images/models/bytedance-seed/seedream-4.5/endpoints",
        checked_at: new Date().toISOString(),
        rates: [{ unit: "image", microusd: 40000 }],
      },
    });
    render(
      createElement(GenerationCost, {
        modelId: "seedream-4.5-openrouter",
        request: { kind: "image" },
      }),
    );
    await userEvent.setup().click(await screen.findByText("Rate details"));
    expect(
      screen.getByText(
        new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      ),
    ).toBeTruthy();
  },
);

it("does not describe a provider's zero historical estimate as a free new request", async () => {
  const { default: userEvent } = await import("@testing-library/user-event");
  mocks.estimate.mockResolvedValue({
    kind: "estimate",
    min_microusd: 0,
    max_microusd: 0,
    stale: false,
    price_freshness: "live",
    excludes_input_cost: false,
    price: {
      provider: "fal",
      model_id: "seedance-2-fal",
      currency: "USD",
      source_kind: "provider",
      source_url: "https://api.fal.ai/v1/models/pricing/estimate",
      checked_at: new Date().toISOString(),
      estimate_basis: "historical_request",
      rates: [{ unit: "request", microusd: 0 }],
    },
  });
  render(
    createElement(GenerationCost, {
      modelId: "seedance-2-fal",
      request: { kind: "video", duration: "8s" },
    }),
  );
  const headline = await screen.findByLabelText("Estimated generation cost");
  expect(headline.textContent).toContain("Estimate unavailable");
  expect(headline.textContent).not.toContain("$0");
  await userEvent.setup().click(await screen.findByText("Rate details"));
  expect(
    screen.getByText(
      "The provider returned a zero historical estimate. This does not confirm that a new request is free.",
    ),
  ).toBeTruthy();
});

it("recovers an accounting warning after the cost panel was absent during generation", async () => {
  const { runAccountedGeneration } = await import("./generation-accounting");
  mocks.estimate.mockResolvedValue({ kind: "unavailable", reason: "No quote" });
  mocks.invoke.mockImplementation(async (command: string) => {
    if (command === "record_generation_receipt")
      throw new Error("Receipt IPC disconnected.");
    return { ok: true, value: { items: [] } };
  });
  expect(
    await runAccountedGeneration(
      {
        project_id: "warning-recovery",
        subject_id: "shot",
        provider: "openrouter",
        model_id: "image",
        kind: "image",
        settings: {},
      },
      { kind: "unavailable", reason: "No quote" },
      async (observer) => {
        await observer.receipt({
          reported_microusd: 23000,
          provider_request_id: "job",
        });
        return "saved-picture";
      },
    ),
  ).toMatchObject({
    ok: true,
    value: "saved-picture",
    warnings: [expect.stringContaining("Receipt IPC disconnected.")],
  });
  render(
    createElement(GenerationCost, {
      modelId: "seedream-4.5-openrouter",
      request: { kind: "image" },
      subject: { project_id: "warning-recovery", subject_id: "shot" },
    }),
  );
  expect(await screen.findByText(/Receipt IPC disconnected/)).toBeTruthy();
});
it("shows a history read failure alongside a retained accounting warning", async () => {
  const { runAccountedGeneration } = await import("./generation-accounting");
  mocks.estimate.mockResolvedValue({ kind: "unavailable", reason: "No quote" });
  mocks.invoke.mockImplementation(async (command: string) =>
    command === "record_generation_receipt"
      ? {
          ok: false,
          error: { code: "IO_ERROR", message: "Receipt storage unavailable." },
        }
      : { ok: true, value: { items: [] } },
  );
  await runAccountedGeneration(
    {
      project_id: "warning-and-history",
      subject_id: "shot",
      provider: "openrouter",
      model_id: "image",
      kind: "image",
      settings: {},
    },
    { kind: "unavailable", reason: "No quote" },
    async (observer) => {
      await observer.receipt({
        reported_microusd: 1,
        provider_request_id: "job",
      });
      return "picture";
    },
  );
  mocks.invoke.mockResolvedValue({
    ok: false,
    error: { code: "IO_ERROR", message: "Usage history unavailable." },
  });
  render(
    createElement(GenerationCost, {
      modelId: "seedream-4.5-openrouter",
      request: { kind: "image" },
      subject: { project_id: "warning-and-history", subject_id: "shot" },
    }),
  );
  expect(await screen.findByText(/Usage history unavailable/)).toBeTruthy();
  expect(screen.getByText(/Receipt storage unavailable/)).toBeTruthy();
});
it("does not turn a pending provider receipt into an accounting failure warning", async () => {
  const { act } = await import("@testing-library/react");
  const { runAccountedGeneration } = await import("./generation-accounting");
  mocks.estimate.mockResolvedValue({ kind: "unavailable", reason: "No quote" });
  mocks.invoke.mockImplementation(async (command: string) =>
    command === "sync_generation_charges"
      ? {
          ok: true,
          value: {
            checked: 1,
            reported: 0,
            notes: [
              {
                request_id: "job",
                kind: "pending",
                message: "Provider receipt has not arrived yet.",
              },
            ],
          },
        }
      : { ok: true, value: { items: [] } },
  );
  render(
    createElement(GenerationCost, {
      modelId: "seedream-4.5-openrouter",
      request: { kind: "image" },
      subject: { project_id: "pending-not-failure", subject_id: "shot" },
    }),
  );
  await act(async () => {
    await runAccountedGeneration(
      {
        project_id: "pending-not-failure",
        subject_id: "shot",
        provider: "openrouter",
        model_id: "image",
        kind: "image",
        settings: {},
      },
      { kind: "unavailable", reason: "No quote" },
      async (observer) => {
        await observer.receipt({
          reported_microusd: null,
          provider_request_id: "job",
        });
        return "picture";
      },
    );
  });
  expect(
    mocks.invoke.mock.calls.some(
      ([command]) => command === "sync_generation_charges",
    ),
  ).toBe(true);
  expect(screen.queryByText(/Provider receipt has not arrived yet/)).toBeNull();
});
