// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import StoryboardPage from "../pages/StoryboardPage";
import { Header } from "../components/Header";

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
it("shows one application header and the active board title in its workspace toolbar", async () => {
 render(createElement(MemoryRouter, { initialEntries: ["/storyboard/sb"] },
  createElement(Header), createElement(Routes, null, createElement(Route, { path: "/storyboard/:id", element: createElement(StoryboardPage) }))));
 await screen.findByRole("button", { name: "Export…" });
 expect(screen.getAllByLabelText("Showbiz")).toHaveLength(1);
 expect(screen.getAllByRole("button", { name: "Settings" })).toHaveLength(1);
 expect(screen.getByText("Opening", { exact: true })).toBeTruthy();
});
