// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import ShotList from "../components/ShotList";
afterEach(cleanup);
it("selects shots with a native button and describes media readiness instead of invented timeline timecodes", async () => {
  const select = vi.fn();
  render(createElement(ShotList, { shots: [1, 2].map((order) => ({ id: String(order), order, image_prompt: "Morning light", video_prompt: null, image_url: "/image.png", video_url: null, status: "pending" as const })), selectedShotId: "1", onSelectShot: select, onAddShot: vi.fn(), onMoveShot: vi.fn(), onDeleteShot: vi.fn() }));
  await userEvent.setup().click(screen.getByRole("button", { name: "Select shot 2", exact: true }));
  expect(select).toHaveBeenCalledWith("2");
  expect(screen.getAllByText("Frame ready")).toHaveLength(2);
  expect(screen.queryByText("00:00:08:00")).toBeNull();
});
