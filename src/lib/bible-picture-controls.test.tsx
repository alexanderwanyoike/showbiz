// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import ProjectBibleView from "../components/ProjectBibleView";
import { updateBibleAssetVariantStatus } from "./backend-api";
vi.mock("../components/GenerationCost", () => ({ GenerationCost: () => null }));
vi.mock("./backend-api", async (original) => ({
  ...(await original<typeof import("./backend-api")>()),
  getBibles: async () => [{ id: "bible" }],
  getBibleAssets: async () => [{ id: "ada", asset_type: "character", name: "Ada" }],
  getBibleAssetVariants: async () => [
    { id: "take-1", asset_id: "ada", is_primary: true, status: "approved", media_url: "/ada-1.png", prompt: "Portrait" },
    { id: "take-2", asset_id: "ada", is_primary: false, status: "approved", media_url: "/ada-2.png", prompt: "Portrait" },
  ],
  updateBibleAssetVariantStatus: vi.fn(async () => undefined),
}));
afterEach(cleanup);
it("opens a named picture dialog, returns keyboard focus on Escape, and exposes which take is selected", async () => {
  render(createElement(ProjectBibleView, { projectId: "film" }));
  const user = userEvent.setup();
  const preview = await screen.findByRole("button", { name: "View Ada picture" });
  await user.click(preview);
  const dialog = await screen.findByRole("dialog", { name: "Picture preview" });
  expect(within(dialog).getByRole("img", { name: "Bible picture" })).toBeTruthy();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog", { name: "Picture preview" })).toBeNull();
  expect(document.activeElement).toBe(preview);
  expect(screen.getByRole("button", { name: "Use take 1 for Ada" }).getAttribute("aria-pressed")).toBe("true");
  const other = screen.getByRole("button", { name: "Use take 2 for Ada" });
  expect(other.getAttribute("aria-pressed")).toBe("false");
  await user.click(other);
  expect(updateBibleAssetVariantStatus).toHaveBeenCalledWith("take-2", "approved", true);
  expect(screen.getByRole("button", { name: "Delete Ada" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Delete take 2 for Ada" })).toBeTruthy();
});
