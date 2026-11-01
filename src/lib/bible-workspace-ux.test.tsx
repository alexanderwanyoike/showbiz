// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import ProjectBibleView from "../components/ProjectBibleView";
import { generateImageAction } from "../actions/generation-actions";
import {
  createBibleAsset,
  getBibles,
  getBibleAssets,
  updateBibleAsset,
} from "./backend-api";
vi.mock("../components/GenerationCost", () => ({ GenerationCost: () => null }));
vi.mock("./backend-api", async (original) => ({
  ...(await original<typeof import("./backend-api")>()),
  getBibles: vi.fn(async () => [{ id: "bible" }]),
  getBibleAssets: vi.fn(async () => []),
  getBibleAssetVariants: async () => [],
  updateBibleAsset: vi.fn(
    async (id: string, values: Record<string, unknown>) => ({ ...values, id }),
  ),
  createBibleAsset: vi.fn(
    async (_id: string, values: Record<string, unknown>) => ({
      ...values,
      id: crypto.randomUUID(),
    }),
  ),
}));
vi.mock("../actions/generation-actions", async (original) => ({
  ...(await original<typeof import("../actions/generation-actions")>()),
  generateImageAction: vi.fn(async () => {
    throw new Error("Provider unavailable");
  }),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("opens a linked Bible section and preserves independent drafts when switching sections with the keyboard", async () => {
  render(
    createElement(ProjectBibleView, {
      projectId: "film",
      initialTab: "frames",
    }),
  );
  const user = userEvent.setup();
  expect(
    (await screen.findByRole("tab", { name: "Frames" })).getAttribute(
      "aria-selected",
    ),
  ).toBe("true");
  await user.type(
    screen.getByRole("textbox", { name: "Frame prompt" }),
    "At the window",
  );
  await user.click(screen.getByRole("tab", { name: "Characters" }));
  await user.type(
    screen.getByRole("textbox", { name: "Character name" }),
    "Ada",
  );
  await user.type(
    screen.getByRole("textbox", { name: "Character prompt" }),
    "A quiet portrait",
  );
  screen.getByRole("tab", { name: "Characters" }).focus();
  await user.keyboard("{ArrowRight}");
  expect(
    screen
      .getByRole("tab", { name: "Locations" })
      .getAttribute("aria-selected"),
  ).toBe("true");
  expect(
    (screen.getByRole("textbox", { name: "Location name" }) as HTMLInputElement)
      .value,
  ).toBe("");
  await user.type(
    screen.getByRole("textbox", { name: "Location name" }),
    "Kitchen",
  );
  await user.click(screen.getByRole("tab", { name: "Characters" }));
  expect(
    (
      screen.getByRole("textbox", {
        name: "Character name",
      }) as HTMLInputElement
    ).value,
  ).toBe("Ada");
  expect(
    (
      screen.getByRole("textbox", {
        name: "Character prompt",
      }) as HTMLTextAreaElement
    ).value,
  ).toBe("A quiet portrait");
  await user.click(screen.getByRole("tab", { name: "Frames" }));
  expect(
    (
      screen.getByRole("textbox", {
        name: "Frame prompt",
      }) as HTMLTextAreaElement
    ).value,
  ).toBe("At the window");
  expect(
    screen.getByRole("combobox", { name: "Bible generation model" }),
  ).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Clear frame draft" }));
  expect(
    (
      screen.getByRole("textbox", {
        name: "Frame prompt",
      }) as HTMLTextAreaElement
    ).value,
  ).toBe("");
  await user.click(screen.getByRole("tab", { name: "Characters" }));
  expect(
    (
      screen.getByRole("textbox", {
        name: "Character name",
      }) as HTMLInputElement
    ).value,
  ).toBe("Ada");
  await user.click(
    screen.getByRole("button", { name: "Clear character draft" }),
  );
  expect(
    (
      screen.getByRole("textbox", {
        name: "Character name",
      }) as HTMLInputElement
    ).value,
  ).toBe("");
  await user.click(screen.getByRole("tab", { name: "Locations" }));
  expect(
    (screen.getByRole("textbox", { name: "Location name" }) as HTMLInputElement)
      .value,
  ).toBe("Kitchen");
});

it("keeps a new character's name and prompt after generation fails", async () => {
  render(createElement(ProjectBibleView, { projectId: "film" }));
  const user = userEvent.setup();
  await user.type(
    await screen.findByRole("textbox", { name: "Character name" }),
    "Ada",
  );
  await user.type(
    screen.getByRole("textbox", { name: "Character prompt" }),
    "A quiet portrait",
  );
  await user.click(screen.getByRole("button", { name: "Generate character" }));
  await screen.findByText("Provider unavailable");
  expect(
    (
      screen.getByRole("textbox", {
        name: "Character name",
      }) as HTMLInputElement
    ).value,
  ).toBe("Ada");
  expect(
    (
      screen.getByRole("textbox", {
        name: "Character prompt",
      }) as HTMLTextAreaElement
    ).value,
  ).toBe("A quiet portrait");
});

it("labels generation and its prerequisites clearly and protects inputs while the request runs", async () => {
  let fail: ((error: Error) => void) | undefined;
  vi.mocked(generateImageAction).mockImplementationOnce(
    () =>
      new Promise((_, reject) => {
        fail = reject;
      }),
  );
  render(createElement(ProjectBibleView, { projectId: "film" }));
  const user = userEvent.setup();
  const panel = await screen.findByRole("tabpanel", { name: "Characters" });
  const generate = within(panel).getByRole("button", {
    name: "Generate character",
  });
  expect(generate.hasAttribute("disabled")).toBe(true);
  expect(within(panel).getByText("Name")).toBeTruthy();
  expect(within(panel).getByText("Prompt for generation")).toBeTruthy();
  expect(
    within(panel).getByText(
      "Used for new pictures and retakes in this Bible view.",
    ),
  ).toBeTruthy();
  const name = within(panel).getByRole("textbox", { name: "Character name" });
  const prompt = within(panel).getByRole("textbox", {
    name: "Character prompt",
  });
  await user.type(name, "Ada");
  await user.type(prompt, "A quiet portrait");
  try {
    await user.click(generate);
    expect(name.hasAttribute("disabled")).toBe(true);
    expect(prompt.hasAttribute("disabled")).toBe(true);
    expect(
      screen
        .getByRole("combobox", { name: "Bible generation model" })
        .hasAttribute("disabled"),
    ).toBe(true);
  } finally {
    fail?.(new Error("Provider unavailable"));
  }
  await screen.findByText("Provider unavailable");
  expect(name.hasAttribute("disabled")).toBe(false);
  await user.click(screen.getByRole("tab", { name: "Frames" }));
  expect(screen.getByText("Characters (optional)")).toBeTruthy();
  expect(screen.getByText("Location (optional)")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Generate frame" })).toBeTruthy();
});

it("shows a failed Bible load with a retry action instead of leaving an endless loading state", async () => {
  vi.mocked(getBibles).mockRejectedValueOnce(
    new Error("Could not load Bible."),
  );
  render(createElement(ProjectBibleView, { projectId: "film" }));
  const user = userEvent.setup();
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "Could not load Bible.",
  );
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(
    await screen.findByRole("textbox", { name: "Character name" }),
  ).toBeTruthy();
});

it("retries a failed first picture on its existing entry instead of creating duplicate characters", async () => {
  render(createElement(ProjectBibleView, { projectId: "film" }));
  const user = userEvent.setup();
  await user.type(
    await screen.findByRole("textbox", { name: "Character name" }),
    "Ada",
  );
  await user.type(
    screen.getByRole("textbox", { name: "Character prompt" }),
    "A quiet portrait",
  );
  await user.click(screen.getByRole("button", { name: "Generate character" }));
  await screen.findByText("Provider unavailable");
  await user.click(screen.getByRole("button", { name: "Generate character" }));
  await screen.findByText("Provider unavailable");
  expect(createBibleAsset).toHaveBeenCalledTimes(1);
  expect(generateImageAction).toHaveBeenCalledTimes(2);
  expect(vi.mocked(generateImageAction).mock.calls[0][2]?.subject_id).toBe(
    vi.mocked(generateImageAction).mock.calls[1][2]?.subject_id,
  );
});

it("names the provider for direct Bible generation models", async () => {
  render(createElement(ProjectBibleView, { projectId: "film" }));
  expect(
    (await screen.findByRole("combobox", { name: "Bible generation model" }))
      .textContent,
  ).toContain("Google AI (Gemini)");
});

it("reuses the incomplete creation entry after its name and prompt are corrected", async () => {
  render(createElement(ProjectBibleView, { projectId: "film" }));
  const user = userEvent.setup();
  const name = await screen.findByRole("textbox", { name: "Character name" });
  const prompt = screen.getByRole("textbox", { name: "Character prompt" });
  await user.type(name, "Ada");
  await user.type(prompt, "A quiet portrait");
  await user.click(screen.getByRole("button", { name: "Generate character" }));
  await screen.findByText("Provider unavailable");
  await user.clear(name);
  await user.type(name, "Ada Lovelace");
  await user.type(prompt, " in warm light");
  await user.click(screen.getByRole("button", { name: "Generate character" }));
  await screen.findByText("Provider unavailable");
  expect(createBibleAsset).toHaveBeenCalledTimes(1);
  const calls = vi.mocked(generateImageAction).mock.calls;
  expect(calls[1][2]?.subject_id).toBe(calls[0][2]?.subject_id);
  expect(updateBibleAsset).toHaveBeenCalledWith(
    calls[0][2]?.subject_id,
    expect.objectContaining({ name: "Ada Lovelace" }),
  );
  expect(screen.queryByRole("button", { name: "Open Ada details" })).toBeNull();
  expect(
    screen.getByRole("button", { name: "Open Ada Lovelace details" }),
  ).toBeTruthy();
});

it("keeps the incomplete frame when its failed recipe is corrected", async () => {
  render(
    createElement(ProjectBibleView, {
      projectId: "film",
      initialTab: "frames",
    }),
  );
  const user = userEvent.setup();
  const prompt = await screen.findByRole("textbox", { name: "Frame prompt" });
  await user.type(prompt, "At the window");
  await user.click(screen.getByRole("button", { name: "Generate frame" }));
  await screen.findByText("Provider unavailable");
  await user.type(prompt, " at sunrise");
  await user.click(screen.getByRole("button", { name: "Generate frame" }));
  await screen.findByText("Provider unavailable");
  expect(createBibleAsset).toHaveBeenCalledTimes(1);
  const calls = vi.mocked(generateImageAction).mock.calls;
  expect(calls[1][2]?.subject_id).toBe(calls[0][2]?.subject_id);
  expect(updateBibleAsset).toHaveBeenCalledWith(
    calls[0][2]?.subject_id,
    expect.objectContaining({
      name: "At the window at sunrise",
      rules_json: JSON.stringify({
        characters: [],
        location: null,
        locationVariantId: null,
        prompt: "At the window at sunrise",
      }),
    }),
  );
});

it("shows generation progress on a newly created entry before its first picture arrives", async () => {
  let fail: ((error: Error) => void) | undefined;
  vi.mocked(generateImageAction).mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
  );
  render(createElement(ProjectBibleView, { projectId: "film" }));
  const user = userEvent.setup();
  await user.type(
    await screen.findByRole("textbox", { name: "Character name" }),
    "Ada",
  );
  await user.type(
    screen.getByRole("textbox", { name: "Character prompt" }),
    "A portrait",
  );
  await user.click(screen.getByRole("button", { name: "Generate character" }));
  try {
    expect(
      await screen.findByRole("status", { name: "Generating picture for Ada" }),
    ).toBeTruthy();
  } finally {
    fail?.(new Error("Provider unavailable"));
  }
  await screen.findByText("Provider unavailable");
  expect(
    screen.queryByRole("status", { name: "Generating picture for Ada" }),
  ).toBeNull();
});

it("recovers an incomplete entry through its library details after a deliberate remount", async () => {
  const first = render(createElement(ProjectBibleView, { projectId: "film" }));
  const user = userEvent.setup();
  await user.type(
    await screen.findByRole("textbox", { name: "Character name" }),
    "Ada",
  );
  await user.type(
    screen.getByRole("textbox", { name: "Character prompt" }),
    "A portrait",
  );
  await user.click(screen.getByRole("button", { name: "Generate character" }));
  await screen.findByText("Provider unavailable");
  const created = await vi.mocked(createBibleAsset).mock.results[0].value;
  first.unmount();
  vi.mocked(getBibleAssets).mockResolvedValueOnce([created]);
  render(createElement(ProjectBibleView, { projectId: "film" }));
  expect(
    await screen.findByRole("textbox", { name: "Character name" }),
  ).toHaveProperty("value", "");
  expect(
    screen.getByRole("textbox", { name: "Character prompt" }),
  ).toHaveProperty("value", "");
  await user.click(screen.getByRole("button", { name: "Open Ada details" }));
  await user.click(screen.getByRole("button", { name: "Variation for Ada" }));
  await user.type(
    screen.getByRole("textbox", { name: "Variation prompt for Ada" }),
    "A corrected portrait",
  );
  await user.click(screen.getByRole("button", { name: "Generate variation" }));
  await screen.findByText("Provider unavailable");
  expect(createBibleAsset).toHaveBeenCalledTimes(1);
  expect(vi.mocked(generateImageAction).mock.calls[1][2]?.subject_id).toBe(
    created.id,
  );
});
