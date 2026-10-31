// @vitest-environment jsdom
import { createElement, type ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import StoryboardPage from "../pages/StoryboardPage";

vi.mock("../components/Header", () => ({ Header: ({ children }: { children?: ReactNode }) => createElement("header", null, children) }));
vi.mock("./backend-api", async (original) => ({
  ...await original<typeof import("./backend-api")>(),
  getStoryboard: async () => ({ id: "sb", project_id: "p", name: "Opening" }),
  getShots: async () => [],
  ensureDefaultTracks: async () => [],
  getTimelineClips: async () => [],
  getBibles: async () => [],
}));
afterEach(cleanup);
it("offers storyboard packages without an editor or movie assembly workspace", async () => {
  render(createElement(MemoryRouter, { initialEntries: ["/storyboard/sb"] },
    createElement(Routes, null, createElement(Route, { path: "/storyboard/:id", element: createElement(StoryboardPage) }))));
  expect(await screen.findByRole("button", { name: "Export ZIP" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Export for Forgecut" })).toBeTruthy();
  expect(screen.queryByRole("tab", { name: "Editor" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Save Movie" })).toBeNull();
});
