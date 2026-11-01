// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import ProjectBibleView from "../components/ProjectBibleView";
import { applicationWork } from "./application-work";

const state = vi.hoisted(() => ({
  withPictures: false,
  extraViews: false,
  deletedView: false,
}));

vi.mock("../components/GenerationCost", () => ({ GenerationCost: () => null }));
vi.mock("./backend-api", async (original) => ({
  ...(await original<typeof import("./backend-api")>()),
  getBibles: async () => [{ id: "bible" }],
  getBibleAssets: async () => [
    { id: "mara", asset_type: "character", name: "Mara" },
    { id: "kitchen", asset_type: "location", name: "Kitchen" },
  ],
  getBibleAssetVariants: async (id: string) =>
    !state.withPictures
      ? []
      : [
          {
            id: `${id}-take`,
            asset_id: id,
            is_primary: true,
            status: "approved",
            media_url: `/${id}.png`,
          },
          ...(id === "kitchen" && state.extraViews
            ? [
                ...(!state.deletedView
                  ? [
                      {
                        id: "kitchen-view-2",
                        asset_id: id,
                        is_primary: false,
                        status: "approved",
                        media_url: "/view-2.png",
                      },
                    ]
                  : []),
                {
                  id: "kitchen-view-3",
                  asset_id: id,
                  is_primary: false,
                  status: "approved",
                  media_url: "/view-3.png",
                },
              ]
            : []),
        ],
}));
afterEach(() => {
  cleanup();
  state.withPictures = false;
  state.extraViews = false;
  state.deletedView = false;
});

it("explains that incomplete characters and locations need pictures before they can be frame references", async () => {
  render(
    createElement(ProjectBibleView, {
      projectId: "film",
      initialTab: "frames",
    }),
  );
  const user = userEvent.setup();
  for (const name of ["Mara", "Kitchen"]) {
    const reference = await screen.findByRole("button", { name });
    expect(reference.hasAttribute("disabled")).toBe(true);
    const description = reference.getAttribute("aria-describedby");
    expect(description).toBeTruthy();
    expect(document.getElementById(description ?? "")?.textContent).toBe(
      "Add a picture first",
    );
    await user.click(reference);
    expect(reference.getAttribute("aria-pressed")).toBe("false");
  }
  expect(applicationWork.getStatus().unsaved).not.toContain("draft");
});

it("removes references that lose their last picture while keeping the frame prompt", async () => {
  state.withPictures = true;
  render(
    createElement(ProjectBibleView, {
      projectId: "film",
      initialTab: "frames",
    }),
  );
  const user = userEvent.setup();
  for (const name of ["Mara", "Kitchen"]) {
    await user.click(await screen.findByRole("button", { name }));
  }
  await user.type(
    screen.getByRole("textbox", { name: "Frame prompt" }),
    "At the window",
  );
  state.withPictures = false;
  await act(async () => {
    window.dispatchEvent(new Event("showbiz:project-changed"));
  });
  await waitFor(() => {
    for (const name of ["Mara", "Kitchen"]) {
      const reference = screen.getByRole("button", { name });
      expect(reference.hasAttribute("disabled")).toBe(true);
      expect(reference.getAttribute("aria-pressed")).toBe("false");
    }
  });
  expect(
    (
      screen.getByRole("textbox", {
        name: "Frame prompt",
      }) as HTMLTextAreaElement
    ).value,
  ).toBe("At the window");
});

it("replaces a deleted selected location view with the surviving primary picture", async () => {
  state.withPictures = true;
  state.extraViews = true;
  render(
    createElement(ProjectBibleView, {
      projectId: "film",
      initialTab: "frames",
    }),
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Kitchen" }));
  await user.click(screen.getByRole("button", { name: "View 2", exact: true }));
  expect(
    screen
      .getByRole("button", { name: "View 2", exact: true })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  state.deletedView = true;
  await act(async () => {
    window.dispatchEvent(new Event("showbiz:project-changed"));
  });
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "View 3", exact: true }),
    ).toBeNull(),
  );
  expect(
    screen
      .getByRole("button", { name: "Kitchen", exact: true })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  expect(
    screen
      .getByRole("button", { name: "View 1", exact: true })
      .getAttribute("aria-pressed"),
  ).toBe("true");
});
