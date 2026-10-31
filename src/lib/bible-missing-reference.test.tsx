// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import ProjectBibleView from "../components/ProjectBibleView";
import { applicationWork } from "./application-work";

vi.mock("../components/GenerationCost", () => ({ GenerationCost: () => null }));
vi.mock("./backend-api", async (original) => ({
  ...(await original<typeof import("./backend-api")>()),
  getBibles: async () => [{ id: "bible" }],
  getBibleAssets: async () => [
    { id: "mara", asset_type: "character", name: "Mara" },
    { id: "kitchen", asset_type: "location", name: "Kitchen" },
  ],
  getBibleAssetVariants: async () => [],
}));
afterEach(cleanup);

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
