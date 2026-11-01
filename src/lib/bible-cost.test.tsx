// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { createBibleAsset } from "./backend-api";
import { generateImageAction } from "../actions/generation-actions";
import ProjectBibleView from "../components/ProjectBibleView";
vi.mock("../actions/generation-actions", async (original) => ({
  ...(await original<typeof import("../actions/generation-actions")>()),
  generateImageAction: vi.fn(async () => {
    throw new Error("Provider unavailable");
  }),
}));
vi.mock("./backend-api", async (original) => ({
  ...(await original<typeof import("./backend-api")>()),
  createBibleAsset: vi.fn(async (_id: string, input: Record<string, unknown>) => ({
    ...input,
    id: "new-frame",
  })),
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
Element.prototype.scrollIntoView = vi.fn();
Element.prototype.hasPointerCapture = () => false;
Element.prototype.setPointerCapture = vi.fn();
Element.prototype.releasePointerCapture = vi.fn();
afterEach(cleanup);
vi.mock("./generation-pricing", () => ({
  getGenerationEstimate: async () => ({
    kind: "estimate",
    min_microusd: 67200,
    max_microusd: 67200,
    stale: false,
    excludes_input_cost: true,
    price: {
      provider: "gemini",
      source_url: "https://ai.google.dev/gemini-api/docs/pricing",
      checked_at: "2026-10-31T12:00:00Z",
    },
  }),
}));
it("shows an image estimate before creating a bible picture", async () => {
  render(createElement(ProjectBibleView, { projectId: "film" }));
  await screen.findByRole("button", { name: "Open Morning details" });
  expect(
    (await screen.findAllByLabelText("Estimated generation cost"))[0]
      .textContent,
  ).toContain("~$0.0672");
});

it("retains the frame draft and its usage identity when generation fails", async () => {
  render(createElement(ProjectBibleView, { projectId: "film" }));
  await screen.findByRole("button", { name: "Open Morning details" });
  const user = userEvent.setup();
  await user.click(screen.getByRole("tab", { name: /^frames$/i }));
  await user.type(
    screen.getByPlaceholderText(
      "What's happening (and the look, e.g. 90s anime)...",
    ),
    "Saved frame draft",
  );
  await user.click(screen.getByRole("button", { name: "Generate frame" }));
  expect(await screen.findByText("Provider unavailable")).toBeTruthy();
  expect((screen.getByRole("textbox", { name: "Frame prompt" }) as HTMLTextAreaElement).value).toBe("Saved frame draft");
  expect(generateImageAction).toHaveBeenCalledWith(
    "Saved frame draft",
    "nano-banana",
    { project_id: "film", subject_id: "new-frame" },
  );
  await user.click(screen.getByRole("button", { name: "Generate frame" }));
  await screen.findByText("Provider unavailable");
  expect(createBibleAsset).toHaveBeenCalledTimes(1);
});
