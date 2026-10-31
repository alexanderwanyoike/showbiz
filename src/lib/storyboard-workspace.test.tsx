// @vitest-environment jsdom
import { createElement, type ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import userEvent from "@testing-library/user-event";
import StoryboardPage from "../pages/StoryboardPage";

vi.mock("../components/Header", () => ({ Header: ({ children }: { children?: ReactNode }) => createElement("header", null, children) }));
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
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });

afterEach(cleanup);
it("offers storyboard packages without an editor or movie assembly workspace", async () => {
  render(createElement(MemoryRouter, { initialEntries: ["/storyboard/sb"] },
    createElement(Routes, null, createElement(Route, { path: "/storyboard/:id", element: createElement(StoryboardPage) }))));
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Export…" }));
  expect(await screen.findByRole("menuitem", { name: "Media ZIP (.zip)" })).toBeTruthy();
  expect(screen.getByRole("menuitem", { name: "Forgecut media (.sbz)" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Export ZIP" })).toBeNull();
  expect(screen.queryByRole("tab", { name: "Editor" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Save Movie" })).toBeNull();
});
