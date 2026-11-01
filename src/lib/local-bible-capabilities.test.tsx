// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import ProjectBibleView from "../components/ProjectBibleView";
const state = vi.hoisted(() => ({ textFrame: false }));
vi.mock("../components/GenerationCost", () => ({ GenerationCost: ({ request }: { request: { kind: string } }) => createElement("span", null, `Estimate: ${request.kind}`) }));
vi.mock("../actions/generation-actions", () => ({
  generateImageAction: vi.fn(async () => { throw new Error("Local provider unavailable"); }),
}));
vi.mock("./backend-api", async (original) => ({
  ...(await original<typeof import("./backend-api")>()),
  getBibles: async () => [{ id: "bible" }],
  getBibleAssets: async () => [
    { id: "character", asset_type: state.textFrame ? "reference" : "character", name: "Morning", rules_json: state.textFrame ? JSON.stringify({ characters: [], location: null, locationVariantId: null, prompt: "Morning" }) : null },
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
afterEach(() => { cleanup(); state.textFrame = false; });
it("keeps text generation available but disables image editing for a local model without that capability", async () => {
  render(createElement(ProjectBibleView, { projectId: "film" }));
  await screen.findByRole("button", { name: "Open Morning details" });
  const user = userEvent.setup();
  await user.click(screen.getByRole("combobox"));
  await user.click(
    screen.getByRole("option", { name: /Local image.*LocalAI/ }),
  );
  await user.click(screen.getByRole("button", { name: "Open Morning details" }));
  expect(
    screen.getByRole("button", { name: "Edit…" }).hasAttribute("disabled"),
  ).toBe(true);
  expect(
    screen.getByRole("button", { name: "Retake" }).hasAttribute("disabled"),
  ).toBe(true);
});
it("allows a text-only local frame while preventing unsupported reference composition", async () => {
  render(createElement(ProjectBibleView, { projectId: "film" }));
  await screen.findByRole("button", { name: "Open Morning details" });
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
  const generate = screen.getByRole("button", { name: "Generate frame" });
  expect(generate.hasAttribute("disabled")).toBe(false);
  await user.click(screen.getByRole("button", { name: /^Morning/ }));
  expect(generate.hasAttribute("disabled")).toBe(true);
});


it("retakes and varies a local prompt-only frame without requiring reference-image composition", async () => {
  state.textFrame = true;
  render(createElement(ProjectBibleView, { projectId: "film", initialTab: "frames" }));
  const user = userEvent.setup();
  await screen.findByRole("button", { name: "Open Morning details" });
  await user.click(screen.getByRole("combobox"));
  await user.click(screen.getByRole("option", { name: /Local image.*LocalAI/ }));
  await user.click(screen.getByRole("button", { name: "Open Morning details" }));
  const retake = screen.getByRole("button", { name: "Retake" });
  expect(retake.hasAttribute("disabled")).toBe(false);
  expect(screen.getByText("Estimate: image")).toBeTruthy();
  await user.click(retake);
  await screen.findByText("Local provider unavailable");
  await user.click(screen.getByRole("button", { name: "Variation…" }));
  expect(screen.getByRole("button", { name: "Generate variation" }).hasAttribute("disabled")).toBe(false);
});
