// @vitest-environment jsdom
import { createElement, type ReactNode } from "react";
import {
  act,
  cleanup,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { applicationWork } from "./application-work";
import StoryboardPage from "../pages/StoryboardPage";
import type { GenerationCostRequest } from "../../shared/generation-cost";
vi.mock("../components/GenerationCost", () => ({
  GenerationCost: ({ request }: { request: GenerationCostRequest }) =>
    createElement(
      "output",
      { "aria-label": "Generation cost mode" },
      request.mode ?? "unknown",
    ),
}));
import {
  setShotModels,
  updateStoryboardSettings,
  setShotVideoSettings,
  deleteShot,
  clearShotStartFrame,
  getCurrentImageVersion,
  getShots,
  updateShot,
} from "./backend-api";
import {
  editImageAction,
  generateAndSaveVideoRequestAction,
} from "../actions/generation-actions";
Element.prototype.scrollIntoView = vi.fn();
Element.prototype.hasPointerCapture = vi.fn(() => false);
Element.prototype.setPointerCapture = vi.fn();
Element.prototype.releasePointerCapture = vi.fn();
vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
vi.mock("../components/Header", () => ({
  Header: ({ children, title }: { children: ReactNode; title: string }) =>
    createElement("header", null, createElement("span", null, title), children),
}));
vi.mock("./backend-api", async (original) => ({
  ...(await original<typeof import("./backend-api")>()),
  getStoryboard: async () => ({
    id: "board",
    project_id: "project",
    name: "Opening",
    image_model: "nano-banana-2",
    video_model: "seedance-2-fal",
  }),
  updateStoryboardSettings: vi.fn(
    async (
      id: string,
      name: string,
      image_model: string,
      video_model: string,
    ) => ({
      ok: true,
      value: { id, project_id: "project", name, image_model, video_model },
    }),
  ),
  updateShot: vi.fn(async () => null),
  deleteShot: vi.fn(async () => false),
  clearShotStartFrame: vi.fn(async () => ({ ok: true, value: null })),
  getShots: vi.fn(async () =>
    [1, 2].map((order) => ({
      id: `shot-${order}`,
      storyboard_id: "board",
      order,
      duration: 8,
      image_model: null,
      video_model: null,
      image_url: `frame-${order}.png`,
      image_path: `images/${order}.png`,
      video_url: null,
      video_prompt: "A quiet static shot.",
      status: "pending",
    })),
  ),
  getBibles: async () => [],
  ensureDefaultTracks: async () => [],
  getTimelineClips: async () => [],
  getImageVersions: async () => [],
  getVideoVersions: async () => [],
  getCurrentImageVersion: vi.fn(async () => null),
  getVersionImageBase64: vi.fn(async () => "data:image/png;base64,ZnJhbWU="),
  getCurrentVideoVersion: async () => null,
  getVersionCount: async () => 0,
  getVideoVersionCount: async () => 0,
  getShotImageBase64: async () => "data:image/png;base64,ZnJhbWU=",
  setShotVideoSettings: vi.fn(
    async (
      _id: string,
      settings: import("../../shared/shot-video-settings").StoredShotVideoSettings,
    ) => ({ ok: true, value: settings }),
  ),
  setShotModels: vi.fn(
    async (_id: string, models: Record<string, unknown>) => ({
      ok: true,
      value: { image_model: null, video_model: null, ...models },
    }),
  ),
}));
vi.mock("../actions/generation-actions", async (original) => ({
  ...(await original<typeof import("../actions/generation-actions")>()),
  editImageAction: vi.fn(async () => "data:image/png;base64,ZWRpdA=="),
  generateAndSaveVideoRequestAction: vi.fn(async () => ({
    success: false,
    error: "Verification only",
  })),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("generates with the selected shot override and leaves another shot on the storyboard default", async () => {
  render(
    createElement(
      MemoryRouter,
      { initialEntries: ["/storyboard/board"] },
      createElement(
        Routes,
        null,
        createElement(Route, {
          path: "/storyboard/:id",
          element: createElement(StoryboardPage),
        }),
      ),
    ),
  );
  const user = userEvent.setup();
  await screen.findByText("Opening");
  const openControls = screen.queryByRole("button", {
    name: "Shot controls",
  });
  if (openControls) await user.click(openControls);
  const controls = await screen.findByRole("region", {
    name: "Shot model controls",
  });
  await user.click(
    within(controls).getByRole("button", { name: "Video model for shot 1" }),
  );
  await user.click(screen.getByRole("option", { name: /Seedance 2.0 Fast/ }));
  await waitFor(() =>
    expect(setShotModels).toHaveBeenCalledWith("shot-1", {
      video_model: "seedance-2-fast-fal",
    }),
  );
  await user.click(
    screen.getByRole("button", {
      name: "Generate video for shot 1",
    }),
  );
  await waitFor(() =>
    expect(generateAndSaveVideoRequestAction).toHaveBeenCalledWith(
      "shot-1",
      "seedance-2-fast-fal",
      expect.objectContaining({ mode: "image-to-video" }),
    ),
  );
  const shotTwo = screen.queryByLabelText("Select shot 2");
  if (shotTwo) await user.click(shotTwo);
  else await user.click(screen.getByRole("img", { name: "Shot 2" }));
  expect(
    await screen.findByRole("button", { name: "Video model for shot 2" }),
  ).toHaveProperty("textContent", expect.stringContaining("Seedance 2.0"));
  await user.click(
    screen.getByRole("button", {
      name: "Generate video for shot 2",
    }),
  );
  await waitFor(() =>
    expect(generateAndSaveVideoRequestAction).toHaveBeenLastCalledWith(
      "shot-2",
      "seedance-2-fal",
      expect.objectContaining({ mode: "image-to-video" }),
    ),
  );
});

it("waits for a model save before allowing generation and preserves the prior choice on failure", async () => {
  let finish!: (result: Awaited<ReturnType<typeof setShotModels>>) => void;
  vi.mocked(setShotModels).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(
    createElement(
      MemoryRouter,
      { initialEntries: ["/storyboard/board"] },
      createElement(
        Routes,
        null,
        createElement(Route, {
          path: "/storyboard/:id",
          element: createElement(StoryboardPage),
        }),
      ),
    ),
  );
  const user = userEvent.setup();
  await screen.findByText("Opening");
  const openControls = screen.queryByRole("button", {
    name: "Shot controls",
  });
  if (openControls) await user.click(openControls);
  const controls = await screen.findByRole("region", {
    name: "Shot model controls",
  });
  await user.click(
    within(controls).getByRole("button", { name: "Video model for shot 1" }),
  );
  await user.click(screen.getByRole("option", { name: /Seedance 2.0 Fast/ }));
  expect(
    screen.getByRole("button", { name: "Generate video for shot 1" }),
  ).toHaveProperty("disabled", true);
  finish({
    ok: false,
    error: { code: "NOT_FOUND", message: "The shot no longer exists." },
  });
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "The shot no longer exists.",
  );
  expect(
    screen.getByRole("button", { name: "Video model for shot 1" }),
  ).toHaveProperty("textContent", expect.stringContaining("Seedance 2.0"));
  expect(generateAndSaveVideoRequestAction).not.toHaveBeenCalled();
});

it("edits model defaults from storyboard settings without requiring or changing a shot selection", async () => {
  render(
    createElement(
      MemoryRouter,
      { initialEntries: ["/storyboard/board"] },
      createElement(
        Routes,
        null,
        createElement(Route, {
          path: "/storyboard/:id",
          element: createElement(StoryboardPage),
        }),
      ),
    ),
  );
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Storyboard settings" }),
  );
  const settings = await screen.findByRole("dialog", {
    name: "Storyboard settings",
  });
  expect(
    within(settings).getByText("Model defaults", { exact: true }),
  ).toBeTruthy();
  await user.click(
    within(settings).getByRole("button", { name: "Storyboard image default" }),
  );
  await user.click(screen.getByRole("option", { name: /GPT Image 2/ }));
  expect(updateStoryboardSettings).not.toHaveBeenCalled();
  await user.click(within(settings).getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(updateStoryboardSettings).toHaveBeenCalledWith(
      "board",
      "Opening",
      "gpt-image-2",
      "seedance-2-fal",
    ),
  );
  expect(setShotModels).not.toHaveBeenCalled();
});

it("quotes the same frame-based video mode that the shot will generate", async () => {
  render(
    createElement(
      MemoryRouter,
      { initialEntries: ["/storyboard/board"] },
      createElement(
        Routes,
        null,
        createElement(Route, {
          path: "/storyboard/:id",
          element: createElement(StoryboardPage),
        }),
      ),
    ),
  );
  await screen.findByText("Opening");
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Shot controls" }));
  expect(screen.getByLabelText("Generation cost mode").textContent).toBe(
    "image-to-video",
  );
});

it("keeps duration choices on their selected shot instead of leaking to another shot with the same model", async () => {
  render(
    createElement(
      MemoryRouter,
      { initialEntries: ["/storyboard/board"] },
      createElement(
        Routes,
        null,
        createElement(Route, {
          path: "/storyboard/:id",
          element: createElement(StoryboardPage),
        }),
      ),
    ),
  );
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Shot controls" }),
  );
  await user.click(screen.getByRole("combobox", { name: "Video duration" }));
  await user.click(screen.getByRole("option", { name: "4s" }));
  await waitFor(() =>
    expect(setShotVideoSettings).toHaveBeenCalledWith(
      "shot-1",
      expect.objectContaining({
        model_id: "seedance-2-fal",
        settings: expect.objectContaining({ duration: "4" }),
      }),
    ),
  );
  await user.click(screen.getByRole("button", { name: "Select shot 2" }));
  expect(
    screen.getByRole("combobox", { name: "Video duration" }).textContent,
  ).toBe("Auto");
  await user.click(screen.getByRole("button", { name: "Select shot 1" }));
  expect(
    screen.getByRole("combobox", { name: "Video duration" }).textContent,
  ).toBe("4s");
});
it("retains a failed settings draft on its shot and blocks generation until saved or discarded", async () => {
  vi.mocked(setShotVideoSettings).mockResolvedValueOnce({
    ok: false,
    error: { code: "IO_ERROR", message: "Could not save video settings." },
  });
  render(
    createElement(
      MemoryRouter,
      { initialEntries: ["/storyboard/board"] },
      createElement(
        Routes,
        null,
        createElement(Route, {
          path: "/storyboard/:id",
          element: createElement(StoryboardPage),
        }),
      ),
    ),
  );
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Shot controls" }),
  );
  await user.click(screen.getByRole("combobox", { name: "Video duration" }));
  await user.click(screen.getByRole("option", { name: "4s" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "Could not save video settings.",
  );
  expect(
    screen.getByRole("combobox", { name: "Video duration" }).textContent,
  ).toBe("4s");
  expect(
    screen.getByRole("button", { name: "Generate video for shot 1" }),
  ).toHaveProperty("disabled", true);
  await user.click(screen.getByRole("button", { name: "Select shot 2" }));
  expect(
    screen.getByRole("combobox", { name: "Video duration" }).textContent,
  ).toBe("Auto");
  await user.click(screen.getByRole("button", { name: "Return to shot 1" }));
  expect(
    screen.getByRole("combobox", { name: "Video duration" }).textContent,
  ).toBe("4s");
  await user.click(screen.getByRole("button", { name: "Discard changes" }));
  expect(screen.queryByRole("alert")).toBeNull();
  expect(
    screen.getByRole("combobox", { name: "Video duration" }).textContent,
  ).toBe("Auto");
  expect(
    screen.getByRole("button", { name: "Generate video for shot 1" }),
  ).toHaveProperty("disabled", false);
});

it("does not start a duplicate generation after stopping local waiting for an unfinished request", async () => {
  let finish!: (
    result: Awaited<ReturnType<typeof generateAndSaveVideoRequestAction>>,
  ) => void;
  vi.mocked(generateAndSaveVideoRequestAction).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(
    createElement(
      MemoryRouter,
      { initialEntries: ["/storyboard/board"] },
      createElement(
        Routes,
        null,
        createElement(Route, {
          path: "/storyboard/:id",
          element: createElement(StoryboardPage),
        }),
      ),
    ),
  );
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Shot controls" }),
  );
  await user.click(
    screen.getByRole("button", { name: "Generate video for shot 1" }),
  );
  await user.click(await screen.findByRole("button", { name: "Stop Waiting" }));
  expect(
    screen.getByRole("button", { name: "Generate video for shot 1" }),
  ).toHaveProperty("disabled", true);
  expect(
    screen.getByText(
      "Stops waiting locally. Provider work and charges may continue.",
    ),
  ).toBeTruthy();
  await user.click(
    screen.getByRole("button", { name: "Generate video for shot 1" }),
  );
  expect(generateAndSaveVideoRequestAction).toHaveBeenCalledTimes(1);
  finish({ success: false, videoUrl: null, error: "Request finished" });
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Generate video for shot 1" }),
    ).toHaveProperty("disabled", false),
  );
});

it("confirms shot deletion and keeps the shot available when the backend rejects deletion", async () => {
  vi.mocked(deleteShot)
    .mockResolvedValueOnce(false)
    .mockResolvedValueOnce(true);
  render(
    createElement(
      MemoryRouter,
      { initialEntries: ["/storyboard/board"] },
      createElement(
        Routes,
        null,
        createElement(Route, {
          path: "/storyboard/:id",
          element: createElement(StoryboardPage),
        }),
      ),
    ),
  );
  const user = userEvent.setup();
  const actions = await screen.findByRole("button", { name: "Shot 1 actions" });
  await user.click(actions);
  await user.click(screen.getByRole("menuitem", { name: "Delete shot" }));
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(document.activeElement).toBe(actions));
  await user.click(actions);
  await user.click(screen.getByRole("menuitem", { name: "Delete shot" }));
  expect(deleteShot).not.toHaveBeenCalled();
  await screen.findByRole("alertdialog", { name: "Delete shot 1?" });
  await user.click(screen.getByRole("button", { name: "Delete shot" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.getByLabelText("Select shot 1")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Delete shot" }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect(screen.getAllByRole("button", { name: /^Select shot / })).toHaveLength(
    1,
  );
});

it("returns the shot and its estimate to text-to-video after removing a start frame", async () => {
  render(
    createElement(
      MemoryRouter,
      { initialEntries: ["/storyboard/board"] },
      createElement(
        Routes,
        null,
        createElement(Route, {
          path: "/storyboard/:id",
          element: createElement(StoryboardPage),
        }),
      ),
    ),
  );
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Shot controls" }),
  );
  await user.click(screen.getByRole("button", { name: "Remove start frame" }));
  await waitFor(() =>
    expect(clearShotStartFrame).toHaveBeenCalledWith("shot-1"),
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Generation cost mode").textContent).toBe(
      "text-to-video",
    ),
  );
  expect(
    screen.getByRole("button", { name: "Generate video for shot 1" }),
  ).toHaveProperty("disabled", false);
});

it("keeps an in-flight frame edit visible and retains its prompt after provider failure", async () => {
  vi.mocked(getCurrentImageVersion).mockResolvedValueOnce({
    id: "take-3",
    shot_id: "shot-1",
    parent_version_id: null,
    version_number: 3,
    edit_type: "generation",
    image_path: "images/3.png",
    prompt: null,
    edit_prompt: null,
    mask_path: null,
    is_current: true,
    created_at: "now",
    image_url: "frame-1.png",
    mask_url: null,
  });
  let rejectEdit: (error: Error) => void = () => {};
  vi.mocked(editImageAction).mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        rejectEdit = reject;
      }),
  );
  render(
    createElement(
      MemoryRouter,
      { initialEntries: ["/storyboard/board"] },
      createElement(
        Routes,
        null,
        createElement(Route, {
          path: "/storyboard/:id",
          element: createElement(StoryboardPage),
        }),
      ),
    ),
  );
  const user = userEvent.setup();
  await screen.findByText("Opening");
  const controls = screen.queryByRole("button", { name: "Shot controls" });
  if (controls) await user.click(controls);
  await user.click(
    await screen.findByRole("button", { name: "Edit frame for shot 1" }),
  );
  const dialog = screen.getByRole("dialog", { name: "Edit frame for shot 1" });
  await user.type(
    within(dialog).getByRole("textbox", { name: "Frame edit prompt" }),
    "Add morning mist",
  );
  await user.click(within(dialog).getByRole("button", { name: "Edit Image" }));
  expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveProperty(
    "disabled",
    true,
  );
  await user.keyboard("{Escape}");
  expect(
    screen.getByRole("dialog", { name: "Edit frame for shot 1" }),
  ).toBeTruthy();
  rejectEdit(new Error("Provider rejected this edit"));
  expect(await within(dialog).findByRole("alert")).toHaveProperty(
    "textContent",
    "Provider rejected this edit",
  );
  expect(
    within(dialog).getByRole("textbox", { name: "Frame edit prompt" }),
  ).toHaveProperty("value", "Add morning mist");
  expect(
    within(dialog).getByRole("button", { name: "Edit Image" }),
  ).toHaveProperty("disabled", false);
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Edit frame for shot 1" }),
    ),
  );
});

it("keeps a saved take viewable while a new request runs and after it fails", async () => {
  const savedShots = await getShots("board");
  vi.mocked(getShots).mockResolvedValueOnce(
    savedShots.map((shot) => ({
      ...shot,
      status: "complete",
      video_url: `saved-${shot.id}.mp4`,
      video_path: `videos/${shot.id}.mp4`,
    })),
  );
  let finish: (
    result: Awaited<ReturnType<typeof generateAndSaveVideoRequestAction>>,
  ) => void = () => {};
  vi.mocked(generateAndSaveVideoRequestAction).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { container } = render(
    createElement(
      MemoryRouter,
      { initialEntries: ["/storyboard/board"] },
      createElement(
        Routes,
        null,
        createElement(Route, {
          path: "/storyboard/:id",
          element: createElement(StoryboardPage),
        }),
      ),
    ),
  );
  const user = userEvent.setup();
  await screen.findByRole("button", { name: "Play video for shot 1" });
  const openControls = screen.queryByRole("button", { name: "Shot controls" });
  if (openControls) await user.click(openControls);
  await user.click(
    screen.getByRole("button", { name: "Generate video for shot 1" }),
  );
  await waitFor(() =>
    expect(generateAndSaveVideoRequestAction).toHaveBeenCalled(),
  );
  expect(container.querySelector("video")?.getAttribute("src")).toBe(
    "saved-shot-1.mp4",
  );
  finish({
    success: false,
    videoUrl: null,
    error: "Missing provider credentials",
  });
  expect(await screen.findByText("Missing provider credentials")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Play video for shot 1" }),
  ).toBeTruthy();
  expect(container.querySelector("video")?.getAttribute("src")).toBe(
    "saved-shot-1.mp4",
  );
  expect(screen.queryByText("failed", { exact: true })).toBeNull();
});

it.each(["model changed", "shot deleted"])("reconciles an unsaved video settings draft when an agent reports %s", async (change) => {
  const originalShots = await getShots("board");
  vi.mocked(setShotVideoSettings).mockResolvedValueOnce({ ok: false, error: { code: "IO_ERROR", message: "Could not save video settings." } });
  render(createElement(MemoryRouter, { initialEntries: ["/storyboard/board"] }, createElement(Routes, null, createElement(Route, { path: "/storyboard/:id", element: createElement(StoryboardPage) }))));
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Shot controls" }));
  await user.click(screen.getByRole("combobox", { name: "Video duration" }));
  await user.click(screen.getByRole("option", { name: "4s" }));
  await screen.findByRole("alert");
  vi.mocked(getShots).mockResolvedValueOnce(change === "shot deleted" ? originalShots.filter((shot) => shot.id !== "shot-1") : originalShots.map((shot) => shot.id === "shot-1" ? { ...shot, video_model: "veo-3.1-fal" } : shot));
  act(() => { window.dispatchEvent(new Event("showbiz:project-changed")); });
  await screen.findByRole("button", { name: "Select shot 2" });
  await waitFor(() => expect(screen.getByRole("button", { name: "Storyboard settings" })).toHaveProperty("disabled", false));
  expect(screen.queryByRole("button", { name: "Return to shot 1" })).toBeNull();
  expect(applicationWork.snapshot().unsaved).not.toContain("draft");
});

it("waits for image model persistence before editing a frame and then uses the saved model", async () => {
  vi.mocked(getCurrentImageVersion).mockResolvedValueOnce({ id: "frame-take", shot_id: "shot-1", parent_version_id: null, version_number: 1, edit_type: "generation", image_path: "images/1.png", prompt: null, edit_prompt: null, mask_path: null, is_current: true, created_at: "now", image_url: "frame-1.png", mask_url: null });
  let finish: ((result: Awaited<ReturnType<typeof setShotModels>>) => void) | undefined;
  vi.mocked(setShotModels).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  vi.mocked(editImageAction).mockRejectedValueOnce(new Error("Verification only"));
  render(createElement(MemoryRouter, { initialEntries: ["/storyboard/board"] }, createElement(Routes, null, createElement(Route, { path: "/storyboard/:id", element: createElement(StoryboardPage) }))));
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Shot controls" }));
  await user.click(screen.getByRole("button", { name: "Image model for shot 1" }));
  await user.click(screen.getByRole("option", { name: /^Nano Banana\s*Google AI/ }));
  const editCommand = screen.getByRole("button", { name: "Edit frame for shot 1" });
  expect(editCommand.getAttribute("aria-disabled")).toBe("true");
  expect(editCommand.getAttribute("aria-description")).toBe("Wait for the model change to finish.");
  await user.click(editCommand);
  expect(screen.queryByRole("dialog", { name: "Edit frame for shot 1" })).toBeNull();
  expect(editImageAction).not.toHaveBeenCalled();
  await act(async () => { finish?.({ ok: true, value: { image_model: "nano-banana", video_model: null } }); });
  await user.click(screen.getByRole("button", { name: "Edit frame for shot 1" }));
  const dialog = await screen.findByRole("dialog", { name: "Edit frame for shot 1" });
  await user.type(within(dialog).getByRole("textbox", { name: "Frame edit prompt" }), "Morning mist");
  await user.click(within(dialog).getByRole("button", { name: "Edit Image" }));
  await waitFor(() => expect(editImageAction).toHaveBeenCalledWith(expect.any(String), "Morning mist", "nano-banana", expect.objectContaining({ subject_id: "shot-1" })));
});

it("saves settings for two shots independently and keeps only the pending shot disabled", async () => {
  const finish: Record<string, () => void> = {};
  const save: typeof setShotVideoSettings = async (shotId, settings) => new Promise((resolve) => { finish[shotId] = () => resolve({ ok: true, value: settings }); });
  vi.mocked(setShotVideoSettings).mockImplementationOnce(save).mockImplementationOnce(save);
  render(createElement(MemoryRouter, { initialEntries: ["/storyboard/board"] }, createElement(Routes, null, createElement(Route, { path: "/storyboard/:id", element: createElement(StoryboardPage) }))));
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Shot controls" }));
  await user.click(screen.getByRole("combobox", { name: "Video duration" }));
  await user.click(screen.getByRole("option", { name: "4s" }));
  await user.click(screen.getByRole("button", { name: "Select shot 2" }));
  expect(screen.getByRole("combobox", { name: "Video duration" })).toHaveProperty("disabled", false);
  await user.click(screen.getByRole("combobox", { name: "Video duration" }));
  await user.click(screen.getByRole("option", { name: "6s" }));
  expect(setShotVideoSettings).toHaveBeenCalledTimes(2);
  await act(async () => { finish["shot-1"](); });
  expect(screen.getByRole("combobox", { name: "Video duration" })).toHaveProperty("disabled", true);
  await user.click(screen.getByRole("button", { name: "Select shot 1" }));
  expect(screen.getByRole("combobox", { name: "Video duration" })).toHaveProperty("disabled", false);
  expect(screen.getByRole("combobox", { name: "Video duration" }).textContent).toBe("4s");
  await act(async () => { finish["shot-2"](); });
  expect(applicationWork.snapshot().unsaved).not.toContain("draft");
});

it("keeps a frame-edit draft focused through a failed agent refresh and a retry", async () => {
  vi.mocked(getCurrentImageVersion).mockResolvedValueOnce({ id: "frame-take", shot_id: "shot-1", parent_version_id: null, version_number: 1, edit_type: "generation", image_path: "images/1.png", prompt: null, edit_prompt: null, mask_path: null, is_current: true, created_at: "now", image_url: "frame-1.png", mask_url: null });
  render(createElement(MemoryRouter, { initialEntries: ["/storyboard/board"] }, createElement(Routes, null, createElement(Route, { path: "/storyboard/:id", element: createElement(StoryboardPage) }))));
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Shot controls" }));
  await user.click(screen.getByRole("button", { name: "Edit frame for shot 1" }));
  const dialog = screen.getByRole("dialog", { name: "Edit frame for shot 1" });
  const prompt = within(dialog).getByRole("textbox", { name: "Frame edit prompt" });
  await user.type(prompt, "Morning mist");
  let reject: ((cause: Error) => void) | undefined;
  vi.mocked(getShots).mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
  act(() => { window.dispatchEvent(new Event("showbiz:project-changed")); });
  try {
    expect(screen.getByRole("dialog", { name: "Edit frame for shot 1" })).toBe(dialog);
    expect(document.activeElement).toBe(prompt);
    expect(within(dialog).getByRole("button", { name: "Edit Image" })).toHaveProperty("disabled", true);
  } finally { await act(async () => { reject?.(new Error("The project is busy. Retry loading.")); }); }
  expect(within(dialog).getByRole("alert")).toHaveProperty("textContent", expect.stringContaining("The project is busy."));
  await user.click(within(dialog).getByRole("button", { name: "Retry loading storyboard" }));
  await waitFor(() => expect(within(dialog).queryByRole("alert")).toBeNull());
  expect(prompt).toHaveProperty("value", "Morning mist");
  expect(document.activeElement).toBe(prompt);
});

it("keeps the previous take status on Stop Waiting and shows a late completed take", async () => {
  const originalShots = await getShots("board");
  vi.mocked(getShots).mockResolvedValueOnce(originalShots.map((shot) => ({ ...shot, status: "complete", video_url: `saved-${shot.id}.mp4` })));
  let finish: ((result: Awaited<ReturnType<typeof generateAndSaveVideoRequestAction>>) => void) | undefined;
  vi.mocked(generateAndSaveVideoRequestAction).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const { container } = render(createElement(MemoryRouter, { initialEntries: ["/storyboard/board"] }, createElement(Routes, null, createElement(Route, { path: "/storyboard/:id", element: createElement(StoryboardPage) }))));
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Shot controls" }));
  await user.click(screen.getByRole("button", { name: "Generate video for shot 1" }));
  await user.click(await screen.findByRole("button", { name: "Stop Waiting" }));
  expect(within(screen.getByRole("complementary", { name: "Shot controls" })).getByText("complete", { exact: true })).toBeTruthy();
  expect(updateShot).not.toHaveBeenCalled();
  expect(container.querySelector("video")?.getAttribute("src")).toBe("saved-shot-1.mp4");
  vi.mocked(getShots).mockResolvedValueOnce(originalShots.map((shot) => shot.id === "shot-1" ? { ...shot, status: "complete", video_url: "late-take.mp4" } : shot));
  await act(async () => { finish?.({ success: true, videoUrl: "late-take.mp4" }); });
  await waitFor(() => expect(container.querySelector("video")?.getAttribute("src")).toBe("late-take.mp4"));
});
