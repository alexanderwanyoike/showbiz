// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import ProjectBibleView from "../components/ProjectBibleView";

vi.mock("../components/GenerationCost", () => ({ GenerationCost: () => null }));
vi.mock("./backend-api", async (original) => ({
  ...(await original<typeof import("./backend-api")>()),
  getBibles: async () => [{ id: "bible" }],
  getBibleAssets: async () => [
    { id: "ada", asset_type: "character", name: "Ada" },
    { id: "home", asset_type: "location", name: "Home" },
    { id: "opening", asset_type: "reference", name: "Opening" },
  ],
  getBibleAssetVariants: async (assetId: string) => [
    {
      id: `${assetId}-1`,
      asset_id: assetId,
      is_primary: true,
      media_url: `/${assetId}-1.png`,
      prompt: "Warm morning light",
      model_id: "nano-banana",
      source_kind: assetId === "opening" ? "imported" : "generated",
      status: "approved",
    },
    {
      id: `${assetId}-2`,
      asset_id: assetId,
      is_primary: false,
      media_url: `/${assetId}-2.png`,
      prompt: "Window light",
      model_id: "nano-banana",
      source_kind: assetId === "opening" ? "imported" : "generated",
      status: "approved",
    },
  ],
}));
afterEach(cleanup);

it.each([
  ["characters", "Ada", "New character"],
  ["locations", "Home", "New location"],
  ["frames", "Opening", "New frame"],
] as const)(
  "opens %s assets as a dedicated workspace rather than a popover",
  async (initialTab, name, composerName) => {
    render(<ProjectBibleView projectId="film" initialTab={initialTab} />);
    const user = userEvent.setup();
    const open = await screen.findByRole("button", {
      name: `Open ${name} details`,
    });
    await user.click(open);
    const workspace = await screen.findByRole("region", {
      name: `${name} details`,
    });
    expect(
      screen.queryByRole("complementary", { name: composerName }),
    ).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(within(workspace).getByText("Warm morning light")).toBeTruthy();
    if (initialTab === "frames")
      expect(within(workspace).getByText("Imported picture")).toBeTruthy();
    expect(
      within(workspace)
        .getByRole("button", { name: `Use take 1 for ${name}` })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      within(workspace).getByRole("button", {
        name: `Delete take 2 for ${name}`,
      }),
    ).toBeTruthy();
    await user.click(
      within(workspace).getByRole("button", { name: "Variation…" }),
    );
    expect(
      within(workspace).getByRole("textbox", {
        name: `Variation prompt for ${name}`,
      }),
    ).toHaveProperty("value", "Warm morning light");
    await user.click(
      within(workspace).getByRole("button", { name: "Back to library" }),
    );
    expect(
      screen.queryByRole("region", { name: `${name} details` }),
    ).toBeNull();
    expect(
      screen.getByRole("complementary", { name: composerName }),
    ).toBeTruthy();
  },
);

it("keeps independent creation and picture-action drafts across detail and library visits", async () => {
  render(<ProjectBibleView projectId="film" />);
  const user = userEvent.setup();
  await user.type(
    await screen.findByRole("textbox", { name: "Character name" }),
    "New person",
  );
  await user.type(
    screen.getByRole("textbox", { name: "Character prompt" }),
    "A quiet portrait",
  );
  await user.click(screen.getByRole("button", { name: "Open Ada details" }));
  await user.click(screen.getByRole("button", { name: "Variation…" }));
  await user.clear(
    screen.getByRole("textbox", { name: "Variation prompt for Ada" }),
  );
  await user.type(
    screen.getByRole("textbox", { name: "Variation prompt for Ada" }),
    "Warmer light",
  );
  await user.click(screen.getByRole("button", { name: "Back to library" }));
  expect(
    screen.getByRole("textbox", { name: "Character name" }),
  ).toHaveProperty("value", "New person");
  expect(
    screen.getByRole("textbox", { name: "Character prompt" }),
  ).toHaveProperty("value", "A quiet portrait");
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Open Ada details, unsaved draft" }),
  );
  await user.click(screen.getByRole("button", { name: "Open Ada details, unsaved draft" }));
  expect(
    screen.getByRole("textbox", { name: "Variation prompt for Ada" }),
  ).toHaveProperty("value", "Warmer light");
});

it("returns to the linked tab library when the route changes from frame details", async () => {
  const view = render(<ProjectBibleView projectId="film" initialTab="frames" />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Open Opening details" }));
  view.rerender(<ProjectBibleView projectId="film" initialTab="characters" />);
  expect(await screen.findByRole("button", { name: "Open Ada details" })).toBeTruthy();
  expect(screen.getByRole("complementary", { name: "New character" })).toBeTruthy();
  expect(screen.queryByRole("region", { name: "Opening details" })).toBeNull();
});

it("uses one library opener that names its retained unsaved picture draft", async () => {
  render(<ProjectBibleView projectId="film" />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Open Ada details" }));
  await user.click(screen.getByRole("button", { name: "Variation…" }));
  await user.type(screen.getByRole("textbox", { name: "Variation prompt for Ada" }), " warmer");
  await user.click(screen.getByRole("button", { name: "Back to library" }));
  const opener = screen.getByRole("button", { name: "Open Ada details, unsaved draft" });
  expect(document.activeElement).toBe(opener);
  expect(screen.queryByRole("button", { name: "Picture actions for Ada" })).toBeNull();
  await user.click(opener);
  expect(screen.getByRole("textbox", { name: "Variation prompt for Ada" })).toHaveProperty("value", "Warm morning light warmer");
});
