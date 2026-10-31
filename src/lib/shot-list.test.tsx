// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import ShotList from "../components/ShotList";
import { thumbnailGenerator } from "./thumbnail-generator";
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it("selects shots with a native button and describes media readiness instead of invented timeline timecodes", async () => {
  const select = vi.fn();
  render(
    createElement(ShotList, {
      shots: [1, 2].map((order) => ({
        id: String(order),
        order,
        image_prompt: "Morning light",
        video_prompt: null,
        image_url: "/image.png",
        video_url: null,
        status: "pending" as const,
      })),
      selectedShotId: "1",
      onSelectShot: select,
      onAddShot: vi.fn(),
      onMoveShot: vi.fn(),
      onDeleteShot: vi.fn(),
    }),
  );
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Select shot 2" }));
  expect(select).toHaveBeenCalledWith("2");
  expect(screen.getAllByText("Frame ready")).toHaveLength(2);
  expect(screen.queryByText("00:00:08:00")).toBeNull();
});

it("shows a generated poster for a video-only shot", async () => {
  vi.spyOn(thumbnailGenerator,"extractFrame").mockResolvedValue("/poster.png");
  render(createElement(ShotList,{shots:[{id:"shot",order:1,image_prompt:null,video_prompt:"Motion",image_url:null,video_url:"/video.mp4",status:"complete"}],selectedShotId:"shot",onSelectShot:vi.fn(),onAddShot:vi.fn(),onMoveShot:vi.fn(),onDeleteShot:vi.fn()}));
  await waitFor(()=>expect(screen.getByRole("button",{name:"Select shot 1"}).querySelector("img")?.getAttribute("src")).toBe("/poster.png"));
});
