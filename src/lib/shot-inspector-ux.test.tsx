// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import ShotInspector, {
  type ShotInspectorProps,
} from "../components/ShotInspector";
import { getAvailableImageModels, getAvailableVideoModels } from "./models";

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

afterEach(cleanup);
function inspectorProps(modelId = "wan-flf2v-fal"): ShotInspectorProps {
  const videoModel = getAvailableVideoModels().find(
    (model) => model.id === modelId,
  )!;
  return {
    shot: {
      id: "shot",
      order: 1,
      image_prompt: null,
      image_url: "frame.png",
      end_frame_url: null,
      video_prompt: "A quiet morning",
      status: "pending",
    },
    frameOptions: [],
    onClearStartFrame: vi.fn(),
    onPickFrame: vi.fn(),
    onUploadFrame: vi.fn(),
    onClearEndFrame: vi.fn(),
    onGenerateVideo: vi.fn(),
    onCancelVideoGeneration: vi.fn(),
    onUpdateShot: vi.fn(),
    videoModel,
    videoSettings: videoModel.defaults,
    onVideoSettingsChange: vi.fn(),
    versions: [],
    currentVersion: null,
    versionCount: 0,
    videoVersions: [],
    currentVideoVersion: null,
    videoVersionCount: 0,
    onVersionSelect: vi.fn(),
    onBranchFrom: vi.fn(),
    onEditImage: vi.fn(),
    onVideoVersionSelect: vi.fn(),
    onGenerateVideoPrompt: vi.fn(),
    onEnhanceVideoPrompt: vi.fn(),
    isGeneratingPrompt: false,
    isEnhancingPrompt: false,
  };
}
it("explains a model's missing required end frame before enabling generation", () => {
  render(
    createElement(
      MemoryRouter,
      null,
      createElement(ShotInspector, inspectorProps()),
    ),
  );
  expect(
    screen.getByRole("button", { name: "Generate video for shot 1" }),
  ).toHaveProperty("disabled", true);
  expect(
    screen.getByText("Add an end frame for Wan 2.1 FLF before generating."),
  ).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: "End frame (required)" })
      .getAttribute("aria-expanded"),
  ).toBe("true");
});

it("keeps the main generation action visible while collapsing settings and offers a direct frame-library route", async () => {
  const props = {
    ...inspectorProps("seedance-2-fal"),
    frameLibraryHref: "/project/film?view=bible&bibleTab=frames",
  };
  render(
    createElement(MemoryRouter, null, createElement(ShotInspector, props)),
  );
  const user = userEvent.setup();
  expect(screen.getByRole("textbox", { name: "Video prompt" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Describe frame" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Improve prompt" })).toBeTruthy();
  expect(
    screen
      .getByRole("link", { name: "Create a frame in the Bible" })
      .getAttribute("href"),
  ).toBe("/project/film?view=bible&bibleTab=frames");
  expect(screen.getByRole("combobox", { name: "Video duration" })).toBeTruthy();
  expect(screen.getByRole("switch", { name: "Generate audio" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Video settings" }));
  expect(
    screen.getByRole("button", { name: "Generate video for shot 1" }),
  ).toHaveProperty("disabled", false);
});
it("does not offer frame editing to a prompt-only model", () => {
  const props = inspectorProps("local-video");
  props.videoModel = {
    ...props.videoModel!,
    modeCapabilities: { textToVideo: { endpoint: "text-only" } },
  };
  render(
    createElement(MemoryRouter, null, createElement(ShotInspector, props)),
  );
  expect(
    screen.queryByRole("button", { name: "Choose start frame" }),
  ).toBeNull();
  expect(
    screen.getByText("Local video uses the video prompt; frames are not sent."),
  ).toBeTruthy();
});
it("lets users remove a saved end frame that the current model does not use", async () => {
  const props = inspectorProps("local-video");
  props.shot = { ...props.shot!, end_frame_url: "end.png" };
  render(
    createElement(MemoryRouter, null, createElement(ShotInspector, props)),
  );
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Remove saved end frame" }));
  expect(props.onClearEndFrame).toHaveBeenCalledWith("shot");
});
it("shows a model's fixed duration even when it cannot be changed", () => {
  render(
    createElement(
      MemoryRouter,
      null,
      createElement(ShotInspector, inspectorProps("wan-flf2v-fal")),
    ),
  );
  expect(screen.getByText("5s", { exact: true })).toBeTruthy();
});

it("offers removal of a selected start frame so a shot can return to prompt-based generation", async () => {
  const props = inspectorProps("seedance-2-fal");
  render(
    createElement(MemoryRouter, null, createElement(ShotInspector, props)),
  );
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Remove start frame" }));
  expect(props.onClearStartFrame).toHaveBeenCalledWith("shot");
});
it("edits the selected image take and explains unavailable editing", async () => {
  const props = inspectorProps("seedance-2-fal");
  const imageModel = {
    ...getAvailableImageModels()[0]!,
    name: "Frame editor",
    supportsImageEditing: true,
  };
  const currentVersion = {
    id: "take-3",
    shot_id: "shot",
    parent_version_id: null,
    version_number: 3,
    edit_type: "generate",
    image_path: "images/3.png",
    prompt: null,
    edit_prompt: null,
    mask_path: null,
    is_current: true,
    created_at: "now",
    image_url: "frame.png",
    mask_url: null,
  };
  render(
    createElement(
      MemoryRouter,
      null,
      createElement(ShotInspector, { ...props, imageModel, currentVersion }),
    ),
  );
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Edit frame for shot 1" }));
  expect(props.onEditImage).toHaveBeenCalledWith("shot", "take-3");
  cleanup();
  render(
    createElement(
      MemoryRouter,
      null,
      createElement(ShotInspector, {
        ...props,
        imageModel: { ...imageModel, supportsImageEditing: false },
        currentVersion,
      }),
    ),
  );
  expect(
    screen.getByRole("button", { name: "Edit frame for shot 1" }),
  ).toHaveProperty("disabled", true);
  expect(
    screen.getByText(
      "Frame editor does not support editing. Choose an editing model in Models for this shot.",
    ),
  ).toBeTruthy();
  cleanup();
  render(
    createElement(
      MemoryRouter,
      null,
      createElement(ShotInspector, { ...props, imageModel }),
    ),
  );
  expect(
    screen.getByRole("button", { name: "Edit frame for shot 1" }),
  ).toHaveProperty("disabled", true);
  expect(
    screen.getByText("Choose or upload a frame to create an editable take."),
  ).toBeTruthy();
});
it("allows frame actions to wrap in a narrow inspector without hiding Remove", () => {
  render(
    createElement(
      MemoryRouter,
      null,
      createElement(ShotInspector, inspectorProps("seedance-2-fal")),
    ),
  );
  const choose = screen.getByRole("button", { name: "Choose start frame" });
  const remove = screen.getByRole("button", { name: "Remove start frame" });
  expect(choose.parentElement).toBe(remove.parentElement);
  expect(choose.parentElement?.classList.contains("flex-wrap")).toBe(true);
  expect(choose.classList.contains("min-w-0")).toBe(true);
});

it("keeps prompt tool routing visible and offers keyboard access to charge details", async () => {
  render(
    createElement(
      MemoryRouter,
      null,
      createElement(ShotInspector, inspectorProps("seedance-2-fal")),
    ),
  );
  expect(screen.getByText("Google AI prompt tools")).toBeTruthy();
  const help = screen.getByRole("button", { name: "About prompt assistance" });
  help.focus();
  await userEvent.setup().keyboard("{Enter}");
  expect(help.getAttribute("aria-expanded")).toBe("true");
  expect(
    screen.getByText(
      "Prompt assistance uses Google AI (Gemini). Add its key in Settings. Any charges are outside the video estimate.",
    ),
  ).toBeTruthy();
});
async function openPopulatedFramePicker() {
  const props = inspectorProps("seedance-2-fal");
  props.frameOptions = [
    {
      variantId: "window",
      label: "Window light",
      prompt: "Window light",
      url: "window.png",
    },
    {
      variantId: "hallway",
      label: "Hallway",
      prompt: "Quiet interior",
      url: "hallway.png",
    },
  ];
  render(
    createElement(MemoryRouter, null, createElement(ShotInspector, props)),
  );
  const user = userEvent.setup();
  const opener = screen.getByRole("button", { name: "Choose start frame" });
  await user.click(opener);
  return { user, opener };
}
it("labels frame search and filters the available choices", async () => {
  const { user } = await openPopulatedFramePicker();
  await user.type(
    screen.getByRole("textbox", { name: "Search frames" }),
    "Hallway",
  );
  expect(
    screen.getByRole("button", { name: "Choose frame Hallway" }),
  ).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Choose frame Window light" }),
  ).toBeNull();
});
it("names each frame choice once rather than repeating its thumbnail and prompt", async () => {
  await openPopulatedFramePicker();
  expect(
    screen.getByRole("button", { name: "Choose frame Window light" }),
  ).toBeTruthy();
});
it("returns focus to Choose frame after dismissing the frame picker", async () => {
  const { user, opener } = await openPopulatedFramePicker();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(document.activeElement).toBe(opener));
});
