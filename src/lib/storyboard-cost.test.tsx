// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import StoryboardPage from "../pages/StoryboardPage";

vi.mock("./update-client", () => ({ updateClient: { getStatus: async () => ({ state: "current", installed_version: "1.0.3" }), subscribe: () => () => {} } }));
vi.mock("./backend-api", async (original) => ({
  ...await original<typeof import("./backend-api")>(),
  getStoryboard: async () => ({ id: "sb", project_id: "p", name: "Opening" }),
  getShots: async () => [{ id: "shot", storyboard_id: "sb", order: 1, duration: 8, image_url: "/frame.png", image_path: "images/frame.png", video_url: null, status: "complete" }],
  ensureDefaultTracks: async () => [],
  getTimelineClips: async () => [],
  getBibles: async () => [],
  getImageVersions: async () => [],
  getVideoVersions: async () => [],
  getCurrentImageVersion: async () => null,
  getCurrentVideoVersion: async () => null,
  getVersionCount: async () => 0,
  getVideoVersionCount: async () => 0,
}));
afterEach(cleanup);
vi.mock("./generation-pricing", () => ({getGenerationEstimate: async () => ({kind: "estimate", min_microusd: 1200000, max_microusd: 2400000, stale: false, excludes_input_cost: false, price: {provider: "fal", source_url: "https://fal.ai", checked_at: "2026-10-31T12:00:00Z"}})}));
it("places a shot's cost estimate next to its generation control", async () => {
 render(createElement(MemoryRouter, { initialEntries: ["/storyboard/sb"] }, createElement(Routes, null, createElement(Route, {path: "/storyboard/:id", element: createElement(StoryboardPage)}))));
 const user = userEvent.setup();
 await user.click(await screen.findByRole("button", {name: "Shot controls"}));
 const estimate = await screen.findByLabelText("Estimated generation cost");
 const generate = screen.getByRole("button", {name: "Generate video for shot 1"});
 expect(estimate.textContent).toContain("~$1.20 to $2.40");
 expect(estimate.compareDocumentPosition(generate) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
