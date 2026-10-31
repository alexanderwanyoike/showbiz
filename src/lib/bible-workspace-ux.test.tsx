// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import ProjectBibleView from "../components/ProjectBibleView";
vi.mock("../components/GenerationCost", () => ({ GenerationCost: () => null }));
vi.mock("./backend-api", async (original) => ({
  ...(await original<typeof import("./backend-api")>()),
  getBibles: async () => [{ id: "bible" }],
  getBibleAssets: async () => [],
  getBibleAssetVariants: async () => [],
  createBibleAsset: async (_id: string, values: Record<string, unknown>) => ({ ...values, id: "draft-asset" }),
}));
vi.mock("../actions/generation-actions", async (original) => ({
  ...(await original<typeof import("../actions/generation-actions")>()),
  generateImageAction: vi.fn(async () => { throw new Error("Provider unavailable"); }),
}));
afterEach(cleanup);
it("opens a linked Bible section and preserves independent drafts when switching sections with the keyboard", async () => {
  render(createElement(ProjectBibleView, { projectId: "film", initialTab: "frames" }));
  const user = userEvent.setup();
  expect((await screen.findByRole("tab", { name: "Frames" })).getAttribute("aria-selected")).toBe("true");
  await user.type(screen.getByRole("textbox", { name: "Frame prompt" }), "At the window");
  await user.click(screen.getByRole("tab", { name: "Characters" }));
  await user.type(screen.getByRole("textbox", { name: "Character name" }), "Ada");
  await user.type(screen.getByRole("textbox", { name: "Character prompt" }), "A quiet portrait");
  screen.getByRole("tab", { name: "Characters" }).focus();
  await user.keyboard("{ArrowRight}");
  expect(screen.getByRole("tab", { name: "Locations" }).getAttribute("aria-selected")).toBe("true");
  expect((screen.getByRole("textbox", { name: "Location name" }) as HTMLInputElement).value).toBe("");
  await user.type(screen.getByRole("textbox", { name: "Location name" }), "Kitchen");
  await user.click(screen.getByRole("tab", { name: "Characters" }));
  expect((screen.getByRole("textbox", { name: "Character name" }) as HTMLInputElement).value).toBe("Ada");
  expect((screen.getByRole("textbox", { name: "Character prompt" }) as HTMLTextAreaElement).value).toBe("A quiet portrait");
  await user.click(screen.getByRole("tab", { name: "Frames" }));
  expect((screen.getByRole("textbox", { name: "Frame prompt" }) as HTMLTextAreaElement).value).toBe("At the window");
  expect(screen.getByRole("combobox", { name: "Bible generation model" })).toBeTruthy();
});

it("keeps a new character's name and prompt after generation fails", async () => {
  render(createElement(ProjectBibleView, { projectId: "film" }));
  const user = userEvent.setup();
  await user.type(await screen.findByRole("textbox", { name: "Character name" }), "Ada");
  await user.type(screen.getByRole("textbox", { name: "Character prompt" }), "A quiet portrait");
  await user.click(screen.getByRole("button", { name: "Create" }));
  await screen.findByText("Provider unavailable");
  expect((screen.getByRole("textbox", { name: "Character name" }) as HTMLInputElement).value).toBe("Ada");
  expect((screen.getByRole("textbox", { name: "Character prompt" }) as HTMLTextAreaElement).value).toBe("A quiet portrait");
});
