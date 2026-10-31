// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import ProjectBibleView from "../components/ProjectBibleView";
import { composeFrameAction } from "../actions/generation-actions";
import {
  deleteBibleAssetVariant,
  updateBibleAssetVariantStatus,
} from "./backend-api";
import { applicationWork } from "./application-work";
vi.mock("../components/GenerationCost", () => ({ GenerationCost: () => null }));
vi.mock("./backend-api", async (original) => ({
  ...(await original<typeof import("./backend-api")>()),
  getBibles: async () => [{ id: "bible" }],
  getBibleAssets: async () => [
    { id: "ada", asset_type: "character", name: "Ada" },
  ],
  createBibleAsset: async (_id: string, input: Record<string, unknown>) => ({
    ...input,
    id: "pending-frame",
  }),
  getBibleAssetVariants: async () => [
    {
      id: "take-1",
      asset_id: "ada",
      is_primary: true,
      status: "approved",
      media_url: "/ada-1.png",
      prompt: "Portrait",
    },
    {
      id: "take-2",
      asset_id: "ada",
      is_primary: false,
      status: "approved",
      media_url: "/ada-2.png",
      prompt: "Portrait",
    },
  ],
  getBibleVariantImageBase64: async () => "data:image/png;base64,aW1hZ2U=",
  updateBibleAssetVariantStatus: vi.fn(async () => undefined),
  deleteBibleAssetVariant: vi.fn(async () => false),
}));
vi.mock("../actions/generation-actions", async (original) => ({
  ...(await original<typeof import("../actions/generation-actions")>()),
  editImageAction: vi.fn(async () => {
    throw new Error("Provider unavailable");
  }),
  composeFrameAction: vi.fn(async () => {
    throw new Error("Provider unavailable");
  }),
}));
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
afterEach(cleanup);
it("opens a named picture dialog, returns keyboard focus on Escape, and exposes which take is selected", async () => {
  render(createElement(ProjectBibleView, { projectId: "film" }));
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Open Ada details" }));
  const preview = await screen.findByRole("button", {
    name: "View Ada picture",
  });
  await user.click(preview);
  const dialog = await screen.findByRole("dialog", { name: "Picture preview" });
  expect(
    within(dialog).getByRole("img", { name: "Bible picture" }),
  ).toBeTruthy();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog", { name: "Picture preview" })).toBeNull();
  expect(document.activeElement).toBe(preview);
  expect(
    screen
      .getByRole("button", { name: "Use take 1 for Ada" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  const other = screen.getByRole("button", { name: "Use take 2 for Ada" });
  expect(other.getAttribute("aria-pressed")).toBe("false");
  await user.click(other);
  expect(updateBibleAssetVariantStatus).toHaveBeenCalledWith(
    "take-2",
    "approved",
    true,
  );
  expect(screen.getByRole("button", { name: "Delete Ada" })).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Delete take 2 for Ada" }),
  ).toBeTruthy();
});

it("keeps an edit instruction open after a failed generation so it can be corrected or retried", async () => {
  render(createElement(ProjectBibleView, { projectId: "film" }));
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Picture actions for Ada" }),
  );
  await user.click(screen.getByRole("button", { name: "Edit…" }));
  const field = screen.getByPlaceholderText(
    "Edit the current picture (e.g. make it night, add rain)...",
  );
  await user.type(field, "Make the light warmer");
  await user.click(screen.getByRole("button", { name: "Generate edit" }));
  await screen.findByText("Provider unavailable");
  expect(
    (
      screen.getByPlaceholderText(
        "Edit the current picture (e.g. make it night, add rain)...",
      ) as HTMLTextAreaElement
    ).value,
  ).toBe("Make the light warmer");
});

it("keeps an adjusted retake prompt after generation fails", async () => {
  render(createElement(ProjectBibleView, { projectId: "film" }));
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Picture actions for Ada" }),
  );
  await user.click(screen.getByRole("button", { name: "Variation…" }));
  const field = screen.getByPlaceholderText(
    "Tweak the prompt for a variation...",
  );
  await user.clear(field);
  await user.type(field, "A warmer portrait");
  await user.click(screen.getByRole("button", { name: "Generate variation" }));
  await screen.findByText("Provider unavailable");
  expect(
    (
      screen.getByPlaceholderText(
        "Tweak the prompt for a variation...",
      ) as HTMLTextAreaElement
    ).value,
  ).toBe("A warmer portrait");
});

it("tracks a selected frame reference as draft work and clears it explicitly", async () => {
  render(
    createElement(ProjectBibleView, {
      projectId: "film",
      initialTab: "frames",
    }),
  );
  const user = userEvent.setup();
  const character = await screen.findByRole("button", { name: "Ada" });
  await user.click(character);
  expect(character.getAttribute("aria-pressed")).toBe("true");
  expect(applicationWork.getStatus().unsaved).toContain("draft");
  await user.click(screen.getByRole("button", { name: "Clear frame draft" }));
  expect(character.getAttribute("aria-pressed")).toBe("false");
  expect(applicationWork.getStatus().unsaved).not.toContain("draft");
});

it("confirms a picture deletion and keeps an unsuccessful deletion available to retry", async () => {
  render(createElement(ProjectBibleView, { projectId: "film" }));
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Picture actions for Ada" }),
  );
  await user.click(
    await screen.findByRole("button", { name: "Delete take 2 for Ada" }),
  );
  const dialog = await screen.findByRole("alertdialog", {
    name: "Delete picture",
  });
  expect(deleteBibleAssetVariant).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(deleteBibleAssetVariant).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole("button", { name: "Delete take 2 for Ada" }),
  );
  const reopened = await screen.findByRole("alertdialog", {
    name: "Delete picture",
  });
  await user.click(
    within(reopened).getByRole("button", { name: "Delete picture" }),
  );
  expect(await within(reopened).findByRole("alert")).toBeTruthy();
  expect(
    screen.getByRole("alertdialog", { name: "Delete picture" }),
  ).toBeTruthy();
});
it("keeps separate edit and variation drafts visible and lets each be cancelled", async () => {
  render(createElement(ProjectBibleView, { projectId: "film" }));
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Picture actions for Ada" }),
  );
  await user.click(screen.getByRole("button", { name: "Edit…" }));
  await user.type(
    screen.getByRole("textbox", { name: "Edit instruction for Ada" }),
    "Warmer light",
  );
  await user.click(screen.getByRole("button", { name: "Variation…" }));
  expect(applicationWork.getStatus().unsaved).toContain("draft");
  await user.click(
    screen.getByRole("button", { name: "Cancel variation for Ada" }),
  );
  expect(applicationWork.getStatus().unsaved).toContain("draft");
  await user.click(screen.getByRole("button", { name: "Edit…" }));
  expect(
    (
      screen.getByRole("textbox", {
        name: "Edit instruction for Ada",
      }) as HTMLTextAreaElement
    ).value,
  ).toBe("Warmer light");
  await user.click(screen.getByRole("button", { name: "Cancel edit for Ada" }));
  expect(
    screen.queryByRole("textbox", { name: "Edit instruction for Ada" }),
  ).toBeNull();
  expect(applicationWork.getStatus().unsaved).not.toContain("draft");
});

it("keeps frame references fixed while their generation request is running", async () => {
  let fail: ((error: Error) => void) | undefined;
  vi.mocked(composeFrameAction).mockImplementationOnce(
    () =>
      new Promise((_, reject) => {
        fail = reject;
      }),
  );
  render(
    createElement(ProjectBibleView, {
      projectId: "film",
      initialTab: "frames",
    }),
  );
  const user = userEvent.setup();
  const character = await screen.findByRole("button", { name: "Ada" });
  await user.click(character);
  await user.type(
    screen.getByRole("textbox", { name: "Frame prompt" }),
    "At the window",
  );
  try {
    await user.click(screen.getByRole("button", { name: "Generate frame" }));
    expect(character.hasAttribute("disabled")).toBe(true);
  } finally {
    fail?.(new Error("Provider unavailable"));
  }
  await screen.findByText("Provider unavailable");
  expect(character.hasAttribute("disabled")).toBe(false);
  expect(character.getAttribute("aria-pressed")).toBe("true");
});

it("opens the detail workspace from More and keeps edit drafts across a library visit", async () => {
  render(createElement(ProjectBibleView, { projectId: "film" }));
  const user = userEvent.setup();
  const more = await screen.findByRole("button", {
    name: "Picture actions for Ada",
  });
  expect(screen.queryByRole("button", { name: "Retake" })).toBeNull();
  await user.click(more);
  const commands = await screen.findByRole("region", {
    name: "Ada details",
  });
  expect(within(commands).getByRole("button", { name: "Retake" })).toBeTruthy();
  await user.click(within(commands).getByRole("button", { name: "Edit…" }));
  await user.type(
    within(commands).getByRole("textbox", { name: "Edit instruction for Ada" }),
    "Warm light",
  );
  await user.click(within(commands).getByRole("button", { name: "Back to library" }));
  expect(screen.queryByRole("region", { name: "Ada details" })).toBeNull();
  const reopened = screen.getByRole("button", { name: "Open Ada details" });
  expect(document.activeElement).toBe(reopened);
  await user.click(reopened);
  expect(
    (
      screen.getByRole("textbox", {
        name: "Edit instruction for Ada",
      }) as HTMLTextAreaElement
    ).value,
  ).toBe("Warm light");
});

it("returns to the picture command when a take preview closes without changing its selection", async () => {
  render(createElement(ProjectBibleView, { projectId: "film" }));
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Picture actions for Ada" }),
  );
  const preview = screen.getByRole("button", { name: "View take 2 for Ada" });
  await user.click(preview);
  await screen.findByRole("dialog", { name: "Picture preview" });
  await user.keyboard("{Escape}");
  expect(
    screen.getByRole("region", { name: "Ada details" }),
  ).toBeTruthy();
  expect(document.activeElement).toBe(preview);
  expect(
    screen
      .getByRole("button", { name: "Use take 1 for Ada" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
});
