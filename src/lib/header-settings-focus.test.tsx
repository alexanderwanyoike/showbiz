// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { Header } from "../components/Header";
vi.mock("./backend-api", async (original) => ({
  ...(await original<typeof import("./backend-api")>()),
  getApiKeyStatusAction: async () => [],
}));
vi.mock("./update-client", () => ({
  updateClient: {
    getStatus: async () => ({ state: "current", installed_version: "1.0.3" }),
    subscribe: () => () => {},
  },
}));
afterEach(cleanup);
it("opens appearance inside Settings and returns focus to the only titlebar gear", async () => {
  render(createElement(Header));
  const user = userEvent.setup();
  const settings = screen.getByRole("button", { name: "Settings" });
  expect(screen.queryByRole("button", { name: "Appearance" })).toBeNull();
  await user.click(settings);
  const dialog = await screen.findByRole("dialog", { name: "Settings" });
  const appearance = within(dialog).getByRole("tab", { name: "Appearance" });
  await user.click(appearance);
  expect(appearance.getAttribute("aria-selected")).toBe("true");
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
  expect(document.activeElement).toBe(settings);
});
