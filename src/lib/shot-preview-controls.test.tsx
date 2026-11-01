// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import ShotPreview from "../components/ShotPreview";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("offers a named stop control that returns playback to the selected frame", async () => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  render(
    createElement(ShotPreview, {
      shot: {
        id: "shot",
        order: 1,
        image_url: "frame.png",
        video_url: "shot.mp4",
        status: "complete",
      },
    }),
  );
  const user = userEvent.setup();
  const play = screen.getByRole("button", { name: "Play (Space)" });
  play.focus();
  expect(await screen.findByRole("tooltip", { name: "Play (Space)" })).toBeTruthy();
  await user.click(play);
  await user.click(screen.getByRole("button", { name: "Stop preview" }));
  expect(screen.getByRole("img", { name: "Shot 1" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Play (Space)" })).toBeTruthy();
});
it("names media controls and leaves Space to focused dialogs instead of starting playback", async () => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  render(
    createElement(
      "div",
      null,
      createElement(ShotPreview, {
        shot: {
          id: "shot",
          order: 1,
          image_url: "frame.png",
          video_url: "video.mp4",
          status: "complete",
        },
      }),
      createElement(
        "section",
        { role: "dialog", "aria-label": "Storyboard settings" },
        createElement("button", null, "Cancel"),
      ),
    ),
  );
  expect(
    screen.getByRole("button", { name: "Play video for shot 1" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("slider", { name: "Shot playback position" }),
  ).toBeTruthy();
  screen.getByRole("button", { name: "Cancel" }).focus();
  await userEvent.setup().keyboard(" ");
  expect(screen.queryByRole("button", { name: "Stop preview" })).toBeNull();
});
it("leaves Space to focused rate-detail disclosure controls", async () => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  render(
    createElement(
      "div",
      null,
      createElement(ShotPreview, {
        shot: {
          id: "shot",
          order: 1,
          image_url: "frame.png",
          video_url: "video.mp4",
          status: "complete",
        },
      }),
      createElement(
        "details",
        null,
        createElement("summary", null, "Rate details"),
      ),
    ),
  );
  screen.getByText("Rate details").focus();
  await userEvent.setup().keyboard(" ");
  expect(screen.queryByRole("button", { name: "Stop preview" })).toBeNull();
});
