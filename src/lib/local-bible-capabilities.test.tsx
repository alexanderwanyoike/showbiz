// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import ProjectBibleView from "../components/ProjectBibleView";
vi.mock("./backend-api", async (original) => ({
  ...(await original<typeof import("./backend-api")>()),
  getBibles: async () => [{ id: "bible" }],
  getBibleAssets: async () => [
    { id: "character", asset_type: "character", name: "Morning" },
  ],
  getBibleAssetVariants: async () => [
    {
      id: "take",
      asset_id: "character",
      is_primary: true,
      status: "approved",
      media_url: "/image.png",
      prompt: "Morning",
    },
  ],
}));
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
Element.prototype.scrollIntoView = vi.fn();
Element.prototype.hasPointerCapture = () => false;
Element.prototype.setPointerCapture = vi.fn();
Element.prototype.releasePointerCapture = vi.fn();
afterEach(cleanup);
it("keeps text generation available but disables image editing for a local model without that capability", async () => {
  render(createElement(ProjectBibleView, { projectId: "film" }));
  await screen.findByRole("button", { name: "Edit" });
  const user = userEvent.setup();
  await user.click(screen.getByRole("combobox"));
  await user.click(
    screen.getByRole("option", { name: /Local image.*LocalAI/ }),
  );
  expect(
    screen.getByRole("button", { name: "Edit" }).hasAttribute("disabled"),
  ).toBe(true);
  expect(
    screen.getByRole("button", { name: "Retake" }).hasAttribute("disabled"),
  ).toBe(true);
});
it("allows a text-only local frame while preventing unsupported reference composition", async () => {
  render(createElement(ProjectBibleView, { projectId: "film" }));
  await screen.findByRole("button", { name: "Edit" });
  const user = userEvent.setup();
  await user.click(screen.getByRole("combobox"));
  await user.click(
    screen.getByRole("option", { name: /Local image.*LocalAI/ }),
  );
  await user.click(screen.getByRole("tab", { name: /^frames$/i }));
  await user.type(
    screen.getByPlaceholderText(
      "What's happening (and the look, e.g. 90s anime)...",
    ),
    "Morning in a quiet room",
  );
  const generate = screen.getByRole("button", { name: "Make frame" });
  expect(generate.hasAttribute("disabled")).toBe(false);
  await user.click(screen.getByRole("button", { name: /^Morning/ }));
  expect(generate.hasAttribute("disabled")).toBe(true);
});
