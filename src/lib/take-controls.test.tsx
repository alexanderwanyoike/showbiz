// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import ImageVersionTimeline from "../components/ImageVersionTimeline";
import VideoVersionTimeline from "../components/VideoVersionTimeline";

afterEach(cleanup);
it("names image and video take selection and identifies the selected take", async () => {
  const selectImage = vi.fn();
  const selectVideo = vi.fn();
  const common = {
    id: "image",
    shot_id: "shot",
    parent_version_id: null,
    version_number: 1,
    edit_type: "generation",
    prompt: "Morning",
    is_current: true,
    created_at: "2026-10-31T12:00:00Z",
  };
  render(
    createElement(
      "div",
      null,
      createElement(ImageVersionTimeline, {
        versions: [
          {
            version: {
              ...common,
              image_path: "frame.png",
              image_url: "frame.png",
              edit_prompt: null,
              mask_path: null,
              mask_url: null,
            },
            children: [],
          },
        ],
        currentVersionId: "image",
        onVersionSelect: selectImage,
        onBranchFrom: vi.fn(),
        onEditFrom: vi.fn(),
        compact: true,
      }),
      createElement(VideoVersionTimeline, {
        versions: [
          {
            version: {
              ...common,
              id: "video",
              video_path: "video.mp4",
              video_url: "video.mp4",
              settings_json: null,
              model_id: null,
            },
            children: [],
          },
        ],
        currentVersionId: "video",
        onVersionSelect: selectVideo,
        compact: true,
      }),
    ),
  );
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: "Use image take 1", pressed: true }),
  );
  await user.click(
    screen.getByRole("button", { name: "Use video take 1", pressed: true }),
  );
  expect(selectImage).toHaveBeenCalledWith("image");
  expect(selectVideo).toHaveBeenCalledWith("video");
});
