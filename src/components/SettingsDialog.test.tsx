// @vitest-environment jsdom

import { createElement } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsDialog } from "./SettingsDialog";
import { API_KEY_PROVIDERS } from "../../shared/provider-catalog";

const api = vi.hoisted(() => ({
  getApiKeyStatusAction: vi.fn(),
  saveApiKeyAction: vi.fn(),
  deleteApiKeyAction: vi.fn(),
}));
const scrollIntoView = vi.fn();
const originalScrollIntoView = Element.prototype.scrollIntoView;

beforeEach(() => {
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
  });
});

vi.mock("../lib/backend-api", () => api);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  if (originalScrollIntoView) {
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: originalScrollIntoView,
    });
  } else {
    Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  }
});

describe("SettingsDialog", () => {
  const emptyStatuses = API_KEY_PROVIDERS.map((provider) => ({
    provider: provider.id,
    name: provider.name,
    is_configured: false,
    source: null,
  }));

  it("puts provider controls in a named scrollable region", async () => {
    api.getApiKeyStatusAction.mockResolvedValue(emptyStatuses);

    render(
      createElement(SettingsDialog, {
        open: true,
        onOpenChange: vi.fn(),
      })
    );

    expect(
      await screen.findByRole("region", { name: "API key providers" })
    ).toBeTruthy();
  });

  it("filters providers by the models they enable", async () => {
    const user = userEvent.setup();
    api.getApiKeyStatusAction.mockResolvedValue(emptyStatuses);

    render(
      createElement(SettingsDialog, {
        open: true,
        onOpenChange: vi.fn(),
      })
    );

    await user.type(
      await screen.findByRole("searchbox", {
        name: "Search providers or models",
      }),
      "Nano Banana"
    );

    expect(
      screen.getByRole("button", { name: "Configure Google AI (Gemini)" })
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Configure OpenAI" })
    ).toBeNull();
  });

  it("expands one credential editor at a time and preserves draft keys", async () => {
    const user = userEvent.setup();
    api.getApiKeyStatusAction.mockResolvedValue(emptyStatuses);

    render(
      createElement(SettingsDialog, {
        open: true,
        onOpenChange: vi.fn(),
      })
    );

    await user.click(
      await screen.findByRole("button", {
        name: "Configure Google AI (Gemini)",
      })
    );
    const geminiInput = screen.getByLabelText("Google AI API key");
    await user.type(geminiInput, "draft-gemini-key");

    await user.click(
      screen.getByRole("button", { name: "Configure OpenAI" })
    );
    expect(
      screen.queryByLabelText("Google AI API key")
    ).toBeNull();
    expect(
      screen.getByLabelText("OpenAI API key")
    ).toBeTruthy();

    await user.click(
      screen.getByRole("button", {
        name: "Configure Google AI (Gemini)",
      })
    );
    expect(
      screen.getByLabelText<HTMLInputElement>("Google AI API key").value
    ).toBe("draft-gemini-key");
  });

  it("puts connected providers first and shows their status while collapsed", async () => {
    api.getApiKeyStatusAction.mockResolvedValue(
      emptyStatuses.map((status) =>
        status.provider === "replicate"
          ? { ...status, is_configured: true, source: "database" }
          : status
      )
    );

    render(
      createElement(SettingsDialog, {
        open: true,
        onOpenChange: vi.fn(),
      })
    );

    const providerButtons = await screen.findAllByRole("button", {
      name: /^Configure /,
    });
    expect(providerButtons[0].getAttribute("aria-label")).toBe(
      "Configure Replicate"
    );
    expect(screen.getByText("Connected")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Remove Replicate API key" })
    ).toBeNull();
  });

  it("brings an expanded credential editor into the visible provider region", async () => {
    const user = userEvent.setup();
    api.getApiKeyStatusAction.mockResolvedValue(emptyStatuses);

    render(
      createElement(SettingsDialog, {
        open: true,
        onOpenChange: vi.fn(),
      })
    );

    await user.click(
      await screen.findByRole("button", { name: "Configure Replicate" })
    );

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
  });

  it("keeps the provider list mounted while status refreshes after saving", async () => {
    const user = userEvent.setup();
    let finishRefresh: ((statuses: typeof emptyStatuses) => void) | undefined;
    api.getApiKeyStatusAction
      .mockResolvedValueOnce(emptyStatuses)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishRefresh = resolve;
          })
      );
    api.saveApiKeyAction.mockResolvedValue({ success: true });

    render(
      createElement(SettingsDialog, {
        open: true,
        onOpenChange: vi.fn(),
      })
    );

    await user.click(
      await screen.findByRole("button", {
        name: "Configure Google AI (Gemini)",
      })
    );
    await user.type(screen.getByLabelText("Google AI API key"), "new-key");
    await user.click(screen.getByRole("button", { name: "Save key" }));

    await waitFor(() =>
      expect(api.getApiKeyStatusAction).toHaveBeenCalledTimes(2)
    );
    expect(
      screen.getByRole("button", { name: "Configure Google AI (Gemini)" })
    ).toBeTruthy();

    finishRefresh?.(emptyStatuses);
  });
});
