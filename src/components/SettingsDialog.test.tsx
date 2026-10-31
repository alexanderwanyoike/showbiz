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
const updates = vi.hoisted(() => ({
  getStatus: vi
    .fn()
    .mockResolvedValue({
      state: "current",
      installed_version: "1.0.2",
      last_checked_at: null,
    }),
  subscribe: vi.fn(() => () => {}),
}));
vi.mock("../lib/update-client", () => ({ updateClient: updates }));
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

  it("switches to Updates with the keyboard and preserves unsaved provider input", async () => {
    api.getApiKeyStatusAction.mockResolvedValue(emptyStatuses);
    const user = userEvent.setup();
    render(
      createElement(SettingsDialog, { open: true, onOpenChange: vi.fn() }),
    );
    await user.click(
      await screen.findByRole("button", {
        name: "Configure Google AI (Gemini)",
      }),
    );
    await user.type(screen.getByLabelText("Google AI API key"), "draft-key");
    screen.getByRole("tab", { name: "Providers" }).focus();
    await user.keyboard("{ArrowDown}");
    expect(
      await screen.findByRole("region", { name: "Application updates" }),
    ).toBeTruthy();
    await user.keyboard("{ArrowUp}");
    expect(
      screen.getByLabelText<HTMLInputElement>("Google AI API key").value,
    ).toBe("draft-key");
  });

  it("can open directly on the Updates tab", async () => {
    api.getApiKeyStatusAction.mockResolvedValue(emptyStatuses);
    render(
      createElement(SettingsDialog, {
        open: true,
        onOpenChange: vi.fn(),
        initialSection: "updates",
      }),
    );
    expect(
      await screen.findByRole("region", { name: "Application updates" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("tab", { name: "Updates" })
        .getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("puts provider controls in a named scrollable region", async () => {
    api.getApiKeyStatusAction.mockResolvedValue(emptyStatuses);

    render(
      createElement(SettingsDialog, {
        open: true,
        onOpenChange: vi.fn(),
      }),
    );

    expect(
      await screen.findByRole("region", { name: "API key providers" }),
    ).toBeTruthy();
  });

  it("filters providers by the models they enable", async () => {
    const user = userEvent.setup();
    api.getApiKeyStatusAction.mockResolvedValue(emptyStatuses);

    render(
      createElement(SettingsDialog, {
        open: true,
        onOpenChange: vi.fn(),
      }),
    );

    await user.type(
      await screen.findByRole("searchbox", {
        name: "Search providers or models",
      }),
      "Nano Banana",
    );

    expect(
      screen.getByRole("button", { name: "Configure Google AI (Gemini)" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Configure OpenAI" }),
    ).toBeNull();
  });

  it("expands one credential editor at a time and preserves draft keys", async () => {
    const user = userEvent.setup();
    api.getApiKeyStatusAction.mockResolvedValue(emptyStatuses);

    render(
      createElement(SettingsDialog, {
        open: true,
        onOpenChange: vi.fn(),
      }),
    );

    await user.click(
      await screen.findByRole("button", {
        name: "Configure Google AI (Gemini)",
      }),
    );
    const geminiInput = screen.getByLabelText("Google AI API key");
    await user.type(geminiInput, "draft-gemini-key");

    await user.click(screen.getByRole("button", { name: "Configure OpenRouter" }));
    expect(screen.queryByLabelText("Google AI API key")).toBeNull();
    expect(screen.getByLabelText("OpenRouter API key")).toBeTruthy();

    await user.click(
      screen.getByRole("button", {
        name: "Configure Google AI (Gemini)",
      }),
    );
    expect(
      screen.getByLabelText<HTMLInputElement>("Google AI API key").value,
    ).toBe("draft-gemini-key");
  });

  it("puts connected providers first and shows their status while collapsed", async () => {
    api.getApiKeyStatusAction.mockResolvedValue(
      emptyStatuses.map((status) =>
        status.provider === "replicate"
          ? { ...status, is_configured: true, source: "database" }
          : status,
      ),
    );

    render(
      createElement(SettingsDialog, {
        open: true,
        onOpenChange: vi.fn(),
      }),
    );

    const providerButtons = await screen.findAllByRole("button", {
      name: /^Configure /,
    });
    expect(providerButtons[0].getAttribute("aria-label")).toBe(
      "Configure Replicate",
    );
    expect(screen.getByText("Key saved")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Remove Replicate API key" }),
    ).toBeNull();
  });

  it("brings an expanded credential editor into the visible provider region", async () => {
    const user = userEvent.setup();
    api.getApiKeyStatusAction.mockResolvedValue(emptyStatuses);

    render(
      createElement(SettingsDialog, {
        open: true,
        onOpenChange: vi.fn(),
      }),
    );

    await user.click(
      await screen.findByRole("button", { name: "Configure OpenRouter" }),
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
          }),
      );
    api.saveApiKeyAction.mockResolvedValue({ success: true });

    render(
      createElement(SettingsDialog, {
        open: true,
        onOpenChange: vi.fn(),
      }),
    );

    await user.click(
      await screen.findByRole("button", {
        name: "Configure Google AI (Gemini)",
      }),
    );
    await user.type(screen.getByLabelText("Google AI API key"), "new-key");
    await user.click(screen.getByRole("button", { name: "Save key" }));

    await waitFor(() =>
      expect(api.getApiKeyStatusAction).toHaveBeenCalledTimes(2),
    );
    expect(
      screen.getByRole("button", { name: "Configure Google AI (Gemini)" }),
    ).toBeTruthy();

    finishRefresh?.(emptyStatuses);
  });
  it("keeps provider drafts registered across tabs and clears them after saving", async () => {
    const { applicationWork } = await import("../lib/application-work");
    api.getApiKeyStatusAction.mockResolvedValue(emptyStatuses);
    api.saveApiKeyAction.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(
      createElement(SettingsDialog, { open: true, onOpenChange: vi.fn() }),
    );
    await user.click(
      await screen.findByRole("button", {
        name: "Configure Google AI (Gemini)",
      }),
    );
    await user.type(screen.getByLabelText("Google AI API key"), "draft-only");
    expect(applicationWork.snapshot().unsaved).toEqual(["credentials"]);
    await user.click(screen.getByRole("tab", { name: "Updates" }));
    expect(applicationWork.snapshot().unsaved).toEqual(["credentials"]);
    await user.click(screen.getByRole("tab", { name: "Providers" }));
    await user.click(screen.getByRole("button", { name: "Save key" }));
    await waitFor(() => expect(applicationWork.snapshot().unsaved).toEqual([]));
    expect(applicationWork.getStatus().active).toEqual([]);
  });
});

it("selects a material and accent while retaining Showbiz's native appearance", async () => {
  api.getApiKeyStatusAction.mockResolvedValue(
    API_KEY_PROVIDERS.map((provider) => ({
      provider: provider.id,
      name: provider.name,
      is_configured: false,
      source: null,
    })),
  );
  const user = userEvent.setup();
  render(createElement(SettingsDialog, { open: true, onOpenChange: vi.fn() }));
  await user.click(await screen.findByRole("tab", { name: "Appearance" }));
  await user.click(
    screen.getByRole("radio", { name: "Aluminium" }),
  );
  await user.click(screen.getByRole("radio", { name: "Emerald" }));
  expect(document.documentElement.dataset.material).toBe("aluminium");
  expect(document.documentElement.dataset.accent).toBe("sage");
  expect(
    JSON.parse(localStorage.getItem("showbiz-appearance") ?? "{}") as unknown,
  ).toEqual({ material: "aluminium", accent: "sage" });
  await user.click(
    screen.getByRole("radio", { name: "Showbiz native" }),
  );
  expect(document.documentElement.dataset.material).toBe("native");
});
it("labels the optional FAL billing credential separately from generation models", async () => {
  api.getApiKeyStatusAction.mockResolvedValue(API_KEY_PROVIDERS.map((provider) => ({ provider: provider.id, name: provider.name, is_configured: false, source: null })));
  render(createElement(SettingsDialog, { open: true, onOpenChange: vi.fn() }));
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Configure fal.ai billing" }));
  expect(screen.getByText("Actual charges only; generation uses your fal.ai key.")).toBeTruthy();
  expect(screen.getByLabelText("fal.ai billing key (optional)")).toBeTruthy();
});
it("shows credential setup only for enabled generation providers and the optional billing connection", async () => {
  api.getApiKeyStatusAction.mockResolvedValue(API_KEY_PROVIDERS.map((provider) => ({ provider: provider.id, name: provider.name, is_configured: false, source: null })));
  render(createElement(SettingsDialog, { open: true, onOpenChange: vi.fn() }));
  await screen.findByRole("button", { name: "Configure Google AI (Gemini)" });
  expect(screen.getAllByRole("button", { name: /^Configure / })).toHaveLength(5);
  for (const name of ["OpenAI", "LTX Video", "Kie AI", "Replicate"]) expect(screen.queryByRole("button", { name: `Configure ${name}` })).toBeNull();
  expect(screen.getByRole("button", { name: "Configure fal.ai billing" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Configure LocalAI" })).toBeTruthy();
});
it.each([["openai", "OpenAI"], ["ltx", "LTX Video"], ["kie", "Kie AI"], ["replicate", "Replicate"]])("keeps a saved inactive %s credential available for management", async (id, name) => {
  api.getApiKeyStatusAction.mockResolvedValue(API_KEY_PROVIDERS.map((provider) => ({ provider: provider.id, name: provider.name, is_configured: provider.id === id, source: provider.id === id ? "database" : null })));
  render(createElement(SettingsDialog, { open: true, onOpenChange: vi.fn() }));
  await userEvent.setup().click(await screen.findByRole("button", { name: `Configure ${name}` }));
  expect(screen.getByRole("button", { name: `Remove ${name} API key` })).toBeTruthy();
  expect(screen.getByText("Saved credential; no enabled generation models")).toBeTruthy();
});
