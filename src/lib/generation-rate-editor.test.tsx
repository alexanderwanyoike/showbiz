// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { openTestDb } from "../../electron/db.test";
import { createGenerationPricingCommands } from "../../electron/commands/generation-pricing";
import { GenerationRateEditor } from "../components/GenerationRateEditor";
const native = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("./bridge", () => native);
afterEach(cleanup);
it("saves an explicit user rate for the selected provider and settings on this device", async () => {
  const db = openTestDb();
  try {
    const commands: Record<
      string,
      (args?: Record<string, unknown>) => unknown
    > = createGenerationPricingCommands(db);
    native.invoke.mockImplementation(async (command, args) =>
      commands[command]?.(args),
    );
    render(
      createElement(GenerationRateEditor, {
        modelId: "veo-3.1-openrouter",
        provider: "openrouter",
        request: {
          kind: "video",
          duration: "8s",
          resolution: "720p",
          audio: true,
        },
      }),
    );
    const user = userEvent.setup();
    await user.type(
      screen.getByRole("spinbutton", { name: "USD per second" }),
      "0.25",
    );
    await user.click(screen.getByRole("button", { name: "Save rate" }));
    expect(await screen.findByText("Rate saved on this device.")).toBeTruthy();
    expect(
      commands.get_generation_price({
        model_id: "veo-3.1-openrouter",
        kind: "video",
      }),
    ).toMatchObject({
      ok: true,
      value: {
        source_kind: "manual",
        source_url: "",
        rates: [
          { unit: "second", microusd: 250000, resolution: "720p", audio: true },
        ],
      },
    });
  } finally {
    db.close();
  }
});

it("removes only the custom rate for the displayed resolution and audio settings", async () => {
  const db = openTestDb();
  try {
    const commands: Record<
      string,
      (args?: Record<string, unknown>) => unknown
    > = createGenerationPricingCommands(db);
    native.invoke.mockImplementation(async (command, args) =>
      commands[command]?.(args),
    );
    const second = {
      unit: "second" as const,
      kind: "video" as const,
      microusd: 200000,
      resolution: "1080p",
      audio: true,
    };
    const price = {
      provider: "openrouter",
      model_id: "veo-3.1-openrouter",
      currency: "USD" as const,
      source_kind: "manual" as const,
      source_url: "",
      checked_at: new Date().toISOString(),
      rates: [
        {
          unit: "second" as const,
          kind: "video" as const,
          microusd: 100000,
          resolution: "720p",
          audio: false,
        },
        second,
      ],
    };
    commands.save_generation_price({ kind: "video", price });
    render(
      createElement(GenerationRateEditor, {
        modelId: price.model_id,
        provider: price.provider,
        request: { kind: "video", resolution: "720p", audio: false },
        price,
      }),
    );
    await userEvent
      .setup()
      .click(
        screen.getByRole("button", {
          name: "Remove custom rate for these settings",
        }),
      );
    expect(
      await screen.findByText("Custom rate removed for these settings."),
    ).toBeTruthy();
    expect(
      commands.get_generation_price({
        model_id: price.model_id,
        kind: "video",
      }),
    ).toMatchObject({ ok: true, value: { rates: [second] } });
  } finally {
    db.close();
  }
});

it("makes a shared custom rate's wider scope explicit before removing it", async () => {
  native.invoke.mockResolvedValue({ ok: true, value: null });
  render(
    createElement(GenerationRateEditor, {
      modelId: "veo-3.1-openrouter",
      provider: "openrouter",
      request: { kind: "video", resolution: "720p", audio: false },
      price: {
        provider: "openrouter",
        model_id: "veo-3.1-openrouter",
        currency: "USD",
        source_kind: "manual",
        source_url: "",
        checked_at: new Date().toISOString(),
        rates: [{ unit: "second", microusd: 100000 }],
      },
    }),
  );
  expect(screen.getByText("All resolutions · Any audio setting")).toBeTruthy();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Remove shared custom rate" }));
  expect(await screen.findByText("Shared custom rate removed.")).toBeTruthy();
});
