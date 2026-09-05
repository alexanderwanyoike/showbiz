// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { UpdateStatus } from "../../shared/update-status";
import { UpdatesPanel } from "./UpdatesPanel";

afterEach(cleanup);

const initial: UpdateStatus = {
  state: "idle", installed_version: "1.0.2", available_version: null, release_notes: "",
  release_url: "https://github.com/alexanderwanyoike/showbiz/releases", last_checked_at: null,
  percent: null, error: null, unavailable_reason: null,
};

function fakeClient(overrides: Partial<UpdateStatus> = {}) {
  let status = { ...initial, ...overrides };
  let listener: ((next: UpdateStatus) => void) | undefined;
  const unsubscribe = vi.fn();
  const client = {
    getStatus: vi.fn(async () => status),
    check: vi.fn(async () => status), download: vi.fn(async () => status), install: vi.fn(async () => status),
    openRelease: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn((callback: (next: UpdateStatus) => void) => { listener = callback; return unsubscribe; }),
  };
  return { client, unsubscribe, emit(change: Partial<UpdateStatus>) { status = { ...status, ...change }; listener?.(status); } };
}

it("lets users check manually and read release notes before downloading", async () => {
  const { client } = fakeClient();
  client.check.mockResolvedValue({ ...initial, state: "available", available_version: "1.1.0", release_notes: "Better timeline editing" });
  const user = userEvent.setup();
  render(createElement(UpdatesPanel, { client }));
  expect(await screen.findByText("1.0.2")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Check for updates" }));
  expect(await screen.findByText("Better timeline editing")).toBeTruthy();
  expect(screen.getByText("1.1.0")).toBeTruthy();
  expect(client.download).not.toHaveBeenCalled();
  expect(client.install).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Download update" }));
  expect(client.download).toHaveBeenCalledTimes(1);
});

it.each([
  ["checking", "Checking for updates…"], ["current", "You're up to date"],
  ["available", "An update is available"], ["downloading", "Downloading update…"],
  ["downloaded", "Ready to install"], ["installing", "Installing update…"],
  ["unavailable", "Automatic updates unavailable"], ["failed", "Update could not be completed"],
] as const)("announces %s without downloading, installing, or moving focus", async (state, text) => {
  const { client } = fakeClient({ state, available_version: "1.1.0" });
  const focused = document.createElement("button");
  focused.textContent = "Keep working";
  document.body.append(focused);
  focused.focus();
  try {
    render(createElement(UpdatesPanel, { client }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(text));
    expect(document.activeElement).toBe(focused);
  } finally { focused.remove(); }
  expect(client.download).not.toHaveBeenCalled();
  expect(client.install).not.toHaveBeenCalled();
});

it("updates download progress from events and waits for an explicit installation click", async () => {
  const { client, emit } = fakeClient({ state: "downloading", percent: 10, available_version: "1.1.0" });
  render(createElement(UpdatesPanel, { client }));
  await screen.findByRole("progressbar");
  act(() => emit({ percent: 65 }));
  expect(screen.getByRole("progressbar").getAttribute("value")).toBe("65");
  expect((screen.getByRole("button", { name: "Check for updates" }) as HTMLButtonElement).disabled).toBe(true);
  act(() => emit({ state: "downloaded", percent: 100 }));
  expect(client.install).not.toHaveBeenCalled();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Install and relaunch" }));
  expect(client.install).toHaveBeenCalledTimes(1);
});

it("shows failures with manual recovery and a keyboard-operable retry", async () => {
  const { client } = fakeClient({ state: "failed", error: "The update could not be verified.", available_version: "1.1.0" });
  render(createElement(UpdatesPanel, { client }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "The update could not be verified.");
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "View release / manual download" }));
  expect(client.openRelease).toHaveBeenCalledTimes(1);
  const check = screen.getByRole("button", { name: "Check for updates" });
  check.focus();
  await user.keyboard("{Enter}");
  expect(client.check).toHaveBeenCalledTimes(1);
});

it("shows unavailable installation guidance and disables network checks", async () => {
  const { client } = fakeClient({ state: "unavailable", unavailable_reason: "Use the AppImage for updates." });
  render(createElement(UpdatesPanel, { client }));
  expect(await screen.findByText("Use the AppImage for updates.")).toBeTruthy();
  expect((screen.getByRole("button", { name: "Check for updates" }) as HTMLButtonElement).disabled).toBe(true);
});

it("does not replace a newer event with an older initial status response", async () => {
  const { client, emit, unsubscribe } = fakeClient();
  let finish!: (status: UpdateStatus) => void;
  client.getStatus.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const { unmount } = render(createElement(UpdatesPanel, { client }));
  act(() => emit({ state: "downloaded", available_version: "1.1.0" }));
  await act(async () => finish(initial));
  expect(screen.getByRole("status").textContent).toBe("Ready to install");
  unmount();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});

it("reports failed requests without losing the downloaded update", async () => {
  const { client } = fakeClient({ state: "downloaded", available_version: "1.1.0" });
  client.install.mockRejectedValue(new Error("Finish the active export before installing."));
  const user = userEvent.setup();
  render(createElement(UpdatesPanel, { client }));
  await user.click(await screen.findByRole("button", { name: "Install and relaunch" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Finish the active export before installing.");
  expect(screen.getByRole("status").textContent).toBe("Ready to install");
});

it.each(["export", "generation", "saving"] as const)("disables installation immediately during %s", async (kind) => {
  const { applicationWork } = await import("../lib/application-work");
  const { client } = fakeClient({ state: "downloaded", available_version: "1.1.0" });
  render(createElement(UpdatesPanel, { client }));
  const button = await screen.findByRole("button", { name: "Install and relaunch" });
  act(() => applicationWork.receive({ active: [kind], unsaved: [], closing: false }));
  expect((button as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(/Finish .* before installing/)).toBeTruthy();
  act(() => applicationWork.receive({ active: [], unsaved: [], closing: false }));
  expect((button as HTMLButtonElement).disabled).toBe(false);
});

it("explains the discard confirmation for unsaved keys without losing the payload", async () => {
  const { applicationWork } = await import("../lib/application-work");
  const { client } = fakeClient({ state: "downloaded", available_version: "1.1.0" });
  render(createElement(UpdatesPanel, { client }));
  const button = await screen.findByRole("button", { name: "Install and relaunch" });
  act(() => applicationWork.receive({ active: [], unsaved: ["credentials"], closing: false }));
  expect(screen.getByText(/unsaved provider keys.*discard/i)).toBeTruthy();
  await userEvent.setup().click(button);
  expect(client.install).toHaveBeenCalledOnce();
  expect(screen.getByText("Ready to install")).toBeTruthy();
  act(() => applicationWork.receive({ active: [], unsaved: [], closing: false }));
});
