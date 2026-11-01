// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import ProjectBibleView from "../components/ProjectBibleView";
import { applicationWork } from "./application-work";

const state = vi.hoisted(() => ({ withPictures: false }));

vi.mock("../components/GenerationCost", () => ({ GenerationCost: () => null }));
vi.mock("./backend-api", async (original) => ({
  ...(await original<typeof import("./backend-api")>()),
  getBibles: async () => [{ id: "bible" }],
  getBibleAssets: async () => [
    { id: "mara", asset_type: "character", name: "Mara" },
    { id: "kitchen", asset_type: "location", name: "Kitchen" },
  ],
  getBibleAssetVariants: async (id: string) => state.withPictures ? [{ id: `${id}-take`, asset_id: id, is_primary: true, status: "approved", media_url: `/${id}.png` }] : [],
}));
afterEach(() => { cleanup(); state.withPictures = false; });

it("explains that incomplete characters and locations need pictures before they can be frame references", async () => {
  render(createElement(ProjectBibleView, { projectId: "film", initialTab: "frames" }));
  const user = userEvent.setup();
  for (const name of ["Mara", "Kitchen"]) {
    const reference = await screen.findByRole("button", { name });
    expect(reference.hasAttribute("disabled")).toBe(true);
    const description = reference.getAttribute("aria-describedby");
    expect(description).toBeTruthy();
    expect(document.getElementById(description ?? "")?.textContent).toBe("Add a picture first");
    await user.click(reference);
    expect(reference.getAttribute("aria-pressed")).toBe("false");
  }
  expect(applicationWork.getStatus().unsaved).not.toContain("draft");
});

it("removes references that lose their last picture while keeping the frame prompt", async () => {
  state.withPictures = true;
  render(createElement(ProjectBibleView, { projectId: "film", initialTab: "frames" }));
  const user = userEvent.setup();
  for (const name of ["Mara", "Kitchen"]) {
    await user.click(await screen.findByRole("button", { name }));
  }
  await user.type(screen.getByRole("textbox", { name: "Frame prompt" }), "At the window");
  state.withPictures = false;
  await act(async () => { window.dispatchEvent(new Event("showbiz:project-changed")); });
  await waitFor(() => {
    for (const name of ["Mara", "Kitchen"]) {
      const reference = screen.getByRole("button", { name });
      expect(reference.hasAttribute("disabled")).toBe(true);
      expect(reference.getAttribute("aria-pressed")).toBe("false");
    }
  });
  expect((screen.getByRole("textbox", { name: "Frame prompt" }) as HTMLTextAreaElement).value).toBe("At the window");
});
