// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import ProjectBibleView from "../components/ProjectBibleView";
import { updateBibleAssetVariantStatus } from "./backend-api";
import { applicationWork } from "./application-work";
vi.mock("../components/GenerationCost", () => ({ GenerationCost: () => null }));
vi.mock("./backend-api", async (original) => ({
  ...(await original<typeof import("./backend-api")>()),
  getBibles: async () => [{ id: "bible" }],
  getBibleAssets: async () => [{ id: "ada", asset_type: "character", name: "Ada" }],
  getBibleAssetVariants: async () => [
    { id: "take-1", asset_id: "ada", is_primary: true, status: "approved", media_url: "/ada-1.png", prompt: "Portrait" },
    { id: "take-2", asset_id: "ada", is_primary: false, status: "approved", media_url: "/ada-2.png", prompt: "Portrait" },
  ],
  getBibleVariantImageBase64: async () => "data:image/png;base64,aW1hZ2U=",
  updateBibleAssetVariantStatus: vi.fn(async () => undefined),
}));
vi.mock("../actions/generation-actions", async (original) => ({
  ...(await original<typeof import("../actions/generation-actions")>()),
  editImageAction: vi.fn(async () => { throw new Error("Provider unavailable"); }),
  composeFrameAction: vi.fn(async () => { throw new Error("Provider unavailable"); }),
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

it("keeps an edit instruction open after a failed generation so it can be corrected or retried", async () => {
  render(createElement(ProjectBibleView, { projectId: "film" }));
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Edit" }));
  const field = screen.getByPlaceholderText("Edit the current picture (e.g. make it night, add rain)...");
  await user.type(field, "Make the light warmer");
  await user.click(screen.getByRole("button", { name: "Apply" }));
  await screen.findByText("Provider unavailable");
  expect((screen.getByPlaceholderText("Edit the current picture (e.g. make it night, add rain)...") as HTMLTextAreaElement).value).toBe("Make the light warmer");
});

it("keeps an adjusted retake prompt after generation fails", async () => {
  render(createElement(ProjectBibleView, { projectId: "film" }));
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Variation" }));
  const field = screen.getByPlaceholderText("Tweak the prompt for a variation...");
  await user.clear(field);
  await user.type(field, "A warmer portrait");
  await user.click(screen.getByRole("button", { name: "Make" }));
  await screen.findByText("Provider unavailable");
  expect((screen.getByPlaceholderText("Tweak the prompt for a variation...") as HTMLTextAreaElement).value).toBe("A warmer portrait");
});

it("tracks a selected frame reference as draft work and clears it explicitly", async () => {
  render(createElement(ProjectBibleView, { projectId: "film", initialTab: "frames" }));
  const user = userEvent.setup();
  const character = await screen.findByRole("button", { name: "Ada" });
  await user.click(character);
  expect(character.getAttribute("aria-pressed")).toBe("true");
  expect(applicationWork.getStatus().unsaved).toContain("draft");
  await user.click(screen.getByRole("button", { name: "Clear frame draft" }));
  expect(character.getAttribute("aria-pressed")).toBe("false");
  expect(applicationWork.getStatus().unsaved).not.toContain("draft");
});
