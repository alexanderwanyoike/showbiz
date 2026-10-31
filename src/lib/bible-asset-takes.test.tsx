// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ProjectBibleView from "../components/ProjectBibleView";
const state = vi.hoisted(() => ({
  removed: new Set<string>(),
  primary: "take-1",
  update: vi.fn<(id: string) => Promise<void>>(),
  remove: vi.fn<(id: string) => Promise<boolean>>(),
}));
vi.mock("../components/GenerationCost", () => ({ GenerationCost: () => null }));
vi.mock("./backend-api", async (original) => ({
  ...(await original<typeof import("./backend-api")>()),
  getBibles: async () => [{ id: "bible" }],
  getBibleAssets: async () => [
    { id: "ada", asset_type: "character", name: "Ada" },
  ],
  getBibleAssetVariants: async () =>
    ["take-1", "take-2"]
      .filter((id) => !state.removed.has(id))
      .sort((a, b) => Number(b === state.primary) - Number(a === state.primary))
      .map((id) => ({
        id,
        asset_id: "ada",
        is_primary: id === state.primary,
        media_url: `/${id}.png`,
        prompt: "Warm morning light",
        model_id: "nano-banana",
        source_kind: "generated",
        status: "approved",
        created_at:
          id === "take-1" ? "2026-10-30T10:00:00Z" : "2026-10-31T10:00:00Z",
      })),
  updateBibleAssetVariantStatus: state.update,
  deleteBibleAssetVariant: state.remove,
  deleteBibleAsset: async () => true,
}));
beforeEach(() => {
  state.removed.clear();
  state.primary = "take-1";
  state.update.mockReset().mockImplementation(async (id) => {
    state.primary = id;
  });
  state.remove.mockReset().mockImplementation(async (id) => {
    state.removed.add(id);
    if (state.primary === id)
      state.primary = id === "take-1" ? "take-2" : "take-1";
    return true;
  });
});
afterEach(cleanup);

it("blocks conflicting take actions while saving a new current take", async () => {
  let finish: (() => void) | undefined;
  state.update.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  render(<ProjectBibleView projectId="film" />);
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Open Ada details" }),
  );
  try {
    await user.click(
      screen.getByRole("button", { name: "Use take 2 for Ada" }),
    );
    expect(
      screen
        .getByRole("button", { name: "Use take 1 for Ada" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "Delete take 1 for Ada" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "Delete Ada" })
        .hasAttribute("disabled"),
    ).toBe(true);
  } finally {
    await act(async () => {
      finish?.();
    });
  }
});

it("keeps a primary-take deletion pending, then selects the surviving take and restores focus", async () => {
  let finish: (() => void) | undefined;
  state.remove.mockImplementationOnce((id) =>
    new Promise<void>((resolve) => {
      finish = resolve;
    }).then(() => {
      state.removed.add(id);
      state.primary = "take-2";
      return true;
    }),
  );
  render(<ProjectBibleView projectId="film" />);
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Open Ada details" }),
  );
  await user.click(
    screen.getByRole("button", { name: "Delete take 1 for Ada" }),
  );
  const confirmation = await screen.findByRole("alertdialog", {
    name: "Delete picture",
  });
  try {
    await user.click(
      within(confirmation).getByRole("button", { name: "Delete picture" }),
    );
    expect(
      within(confirmation)
        .getByRole("button", { name: "Deleting…" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      within(confirmation)
        .getByRole("button", { name: "Cancel" })
        .hasAttribute("disabled"),
    ).toBe(true);
    await user.keyboard("{Escape}");
    expect(
      screen.getByRole("alertdialog", { name: "Delete picture" }),
    ).toBeTruthy();
  } finally {
    await act(async () => {
      finish?.();
    });
  }
  const remainingTakes = screen.getAllByRole("button", { name: /^Use take/ });
  expect(remainingTakes).toHaveLength(1);
  expect(remainingTakes[0].getAttribute("aria-pressed")).toBe("true");
  expect(
    screen.getByRole("img", { name: "Ada current take" }).getAttribute("src"),
  ).toBe("/take-2.png");
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "View Ada picture" }),
  );
});

it("keeps the saved current picture and shows a retryable selection error", async () => {
  state.update.mockRejectedValueOnce(
    new Error("Current take could not be saved."),
  );
  render(<ProjectBibleView projectId="film" />);
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Open Ada details" }),
  );
  await user.click(screen.getByRole("button", { name: "Use take 2 for Ada" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "Current take could not be saved.",
  );
  expect(
    screen.getByRole("img", { name: "Ada current take" }).getAttribute("src"),
  ).toBe("/take-1.png");
  await user.click(screen.getByRole("button", { name: "Use take 2 for Ada" }));
  expect(
    screen.getByRole("img", { name: "Ada current take" }).getAttribute("src"),
  ).toBe("/take-2.png");
  expect(screen.queryByRole("alert")).toBeNull();
});

it("returns to the library after deleting its selected entry", async () => {
  render(<ProjectBibleView projectId="film" />);
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Open Ada details" }),
  );
  await user.click(screen.getByRole("button", { name: "Delete Ada" }));
  const confirmation = await screen.findByRole("alertdialog", {
    name: "Delete Bible entry",
  });
  await user.click(
    within(confirmation).getByRole("button", { name: "Delete entry" }),
  );
  expect(await screen.findByText("No characters yet")).toBeTruthy();
  expect(screen.queryByRole("region", { name: "Ada details" })).toBeNull();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "New character" }),
  );
});

it("keeps take identities and keyboard focus stable when the native refresh returns the primary first", async () => {
  let finish: (() => void) | undefined;
  state.update.mockImplementationOnce((id) =>
    new Promise<void>((resolve) => {
      finish = resolve;
    }).then(() => {
      state.primary = id;
    }),
  );
  render(<ProjectBibleView projectId="film" />);
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Open Ada details" }),
  );
  const selected = screen.getByRole("button", { name: "Use take 2 for Ada" });
  try {
    await user.click(selected);
    selected.blur();
  } finally {
    await act(async () => {
      finish?.();
    });
  }
  const refreshed = screen.getByRole("button", { name: "Use take 2 for Ada" });
  expect(within(refreshed).getByRole("img").getAttribute("src")).toBe(
    "/take-2.png",
  );
  expect(refreshed.getAttribute("aria-pressed")).toBe("true");
  expect(document.activeElement).toBe(refreshed);
});
