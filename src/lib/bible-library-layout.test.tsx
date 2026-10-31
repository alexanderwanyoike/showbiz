// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import ProjectBibleView from "../components/ProjectBibleView";
vi.mock("../components/GenerationCost", () => ({ GenerationCost: () => null }));
vi.mock("./backend-api", async (original) => ({
  ...(await original<typeof import("./backend-api")>()),
  getBibles: async () => [{ id: "bible" }],
  getBibleAssets: async () => [{ id: "mara", asset_type: "character", name: "Mara" }],
  getBibleAssetVariants: async () => [{ id: "take", asset_id: "mara", is_primary: true, media_url: "/mara.png", status: "approved" }],
}));
afterEach(cleanup);
it("keeps new image controls in a reopenable creation dock without losing independent section drafts", async () => {
  render(createElement(ProjectBibleView, { projectId: "film", initialTab: "frames" }));
  const user = userEvent.setup();
  const dock = await screen.findByRole("complementary", { name: "New frame" });
  expect(within(dock).getByRole("combobox", { name: "Bible generation model" })).toBeTruthy();
  expect(screen.getByRole("region", { name: "Frames library" })).toBeTruthy();
  await user.type(within(dock).getByRole("textbox", { name: "Frame prompt" }), "Morning light");
  await user.click(within(dock).getByRole("button", { name: "Close creation panel" }));
  expect(screen.queryByRole("complementary", { name: "New frame" })).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "New frame" }));
  await user.click(screen.getByRole("button", { name: "New frame" }));
  expect((screen.getByRole("textbox", { name: "Frame prompt" }) as HTMLTextAreaElement).value).toBe("Morning light");
  await user.click(screen.getByRole("tab", { name: "Characters" }));
  await user.type(screen.getByRole("textbox", { name: "Character name" }), "Ada");
  await user.click(screen.getByRole("tab", { name: "Frames" }));
  expect((screen.getByRole("textbox", { name: "Frame prompt" }) as HTMLTextAreaElement).value).toBe("Morning light");
  await user.click(screen.getByRole("tab", { name: "Characters" }));
  expect((screen.getByRole("textbox", { name: "Character name" }) as HTMLInputElement).value).toBe("Ada");
});
it("summarizes frame reference selection and keeps Generate in the frame creation panel", async () => {
  render(createElement(ProjectBibleView, { projectId: "film", initialTab: "frames" }));
  const user = userEvent.setup();
  const dock = await screen.findByRole("complementary", { name: "New frame" });
  await user.click(within(dock).getByRole("button", { name: "Mara" }));
  expect(within(dock).getByText("1 character selected")).toBeTruthy();
  await user.type(within(dock).getByRole("textbox", { name: "Frame prompt" }), "Morning light");
  expect(within(dock).getByRole("button", { name: "Generate frame" }).hasAttribute("disabled")).toBe(false);
});
