// @vitest-environment jsdom
import { createElement, useState } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import ShotList from "../components/ShotList";
import { thumbnailGenerator } from "./thumbnail-generator";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
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
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Shot 2 actions" }));
  expect(
    screen
      .getByRole("menuitem", { name: "Move earlier" })
      .getAttribute("aria-disabled"),
  ).not.toBe("true");
  expect(
    screen
      .getByRole("menuitem", { name: "Move later" })
      .getAttribute("aria-disabled"),
  ).toBe("true");
});

it("shows a generated poster for a video-only shot", async () => {
  vi.spyOn(thumbnailGenerator, "extractFrame").mockResolvedValue("/poster.png");
  render(
    createElement(ShotList, {
      shots: [
        {
          id: "shot",
          order: 1,
          image_prompt: null,
          video_prompt: "Motion",
          image_url: null,
          video_url: "/video.mp4",
          status: "complete",
        },
      ],
      selectedShotId: "shot",
      onSelectShot: vi.fn(),
      onAddShot: vi.fn(),
      onMoveShot: vi.fn(),
      onDeleteShot: vi.fn(),
    }),
  );
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: "Select shot 1" })
        .querySelector("img")
        ?.getAttribute("src"),
    ).toBe("/poster.png"),
  );
});

it("moves shot selection and focus with sequence navigation keys", async () => {
  const select = vi.fn();
  function Sequence() {
    const [selected, setSelected] = useState("1");
    return createElement(ShotList, {
      shots: [1, 2, 3].map((order) => ({
        id: String(order),
        order,
        image_prompt: null,
        video_prompt: null,
        image_url: null,
        video_url: null,
        status: "pending" as const,
      })),
      selectedShotId: selected,
      onSelectShot: (id) => {
        setSelected(id);
        select(id);
      },
      onAddShot: vi.fn(),
      onMoveShot: vi.fn(),
      onDeleteShot: vi.fn(),
    });
  }
  render(createElement(Sequence));
  const user = userEvent.setup();
  screen.getByRole("button", { name: "Select shot 1" }).focus();
  await user.keyboard("{ArrowRight}");
  expect(
    screen.getByRole("button", { name: "Select shot 2", pressed: true }),
  ).toBe(document.activeElement);
  await user.keyboard("{End}");
  expect(
    screen.getByRole("button", { name: "Select shot 3", pressed: true }),
  ).toBe(document.activeElement);
  await user.keyboard("{Home}");
  expect(
    screen.getByRole("button", { name: "Select shot 1", pressed: true }),
  ).toBe(document.activeElement);
  expect(select).toHaveBeenLastCalledWith("1");
});
it("explains why a saved generating shot cannot be deleted even without a local pending request", async () => {
  render(createElement(ShotList, { shots: [{ id: "saving", storyboard_id: "board", order: 1, duration: 2, image_url: null, video_url: null, status: "generating" as const, created_at: "", updated_at: "" }], selectedShotId: "saving", onSelectShot: vi.fn(), onAddShot: vi.fn(), onDeleteShot: vi.fn(), onMoveShot: vi.fn() }));
  await userEvent.setup().click(screen.getByRole("button", { name: "Shot 1 actions" }));
  expect(screen.getByRole("menuitem", { name: "Delete shot" }).getAttribute("aria-description")).toBe("Wait for this shot's current request to finish.");
});
