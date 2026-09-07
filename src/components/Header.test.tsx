// @vitest-environment jsdom
import { createElement, Profiler } from "react";
import { MemoryRouter } from "react-router";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { Header } from "./Header";

const client = vi.hoisted(() => ({ getStatus: vi.fn(), subscribe: vi.fn(() => () => {}) }));
vi.mock("../lib/update-client", () => ({ updateClient: client }));
vi.mock("../lib/backend-api", async (importOriginal) => ({ ...await importOriginal<typeof import("../lib/backend-api")>(), getApiKeyStatusAction: vi.fn().mockResolvedValue([]) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it.each(["available", "downloaded"])("opens the Updates tab from a %s header indicator", async (state) => {
  client.getStatus.mockResolvedValue({ state, installed_version: "1.0.2", available_version: "1.1.0" });
  const user = userEvent.setup();
  render(createElement(MemoryRouter, {}, createElement(Header)));
  const indicator = await screen.findByRole("button", { name: /Update available|Update ready/ });
  await user.click(indicator);
  expect(await screen.findByRole("region", { name: "Application updates" })).toBeTruthy();
});

it.each(["idle", "checking", "current", "downloading", "failed", "unavailable"])("does not show a header indicator for %s", async (state) => {
  client.getStatus.mockResolvedValue({ state, installed_version: "1.0.2" });
  render(createElement(MemoryRouter, {}, createElement(Header)));
  await waitFor(() => expect(client.getStatus).toHaveBeenCalled());
  expect(screen.queryByRole("button", { name: /Update available|Update ready/ })).toBeNull();
});


it("opens Updates in the first dialog commit without painting Providers first", async () => {
  client.getStatus.mockResolvedValue({ state: "available", installed_version: "1.0.2" });
  const paintedTabs: string[] = [];
  render(createElement(Profiler, { id: "header", onRender: () => {
    const selected = document.querySelector('[role="tab"][aria-selected="true"]');
    if (selected) paintedTabs.push(selected.textContent!);
  } }, createElement(MemoryRouter, {}, createElement(Header))));
  await userEvent.setup().click(await screen.findByRole("button", { name: "Update available" }));
  expect(paintedTabs[0]).toBe("Updates");
});
