// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
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
it("returns focus to the persistent titlebar command after closing preferences", async () => {
  render(createElement(Header));
  const user = userEvent.setup();
  const appearance = screen.getByRole("button", { name: "Appearance" });
  await user.click(appearance);
  await screen.findByRole("dialog", { name: "Settings" });
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
  expect(document.activeElement).toBe(appearance);
});
