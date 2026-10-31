// @vitest-environment jsdom
import { createElement, useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { StoryboardLayout } from "../components/layout/StoryboardLayout";
afterEach(cleanup);
it("prioritizes the preview and shot strip while keeping shot controls available on demand", async () => {
  function Workspace() {
    const [open, setOpen] = useState(false);
    return createElement(
      "div",
      null,
      createElement(
        "button",
        { onClick: () => setOpen(!open) },
        "Shot controls",
      ),
      createElement(StoryboardLayout, {
        controlsOpen: open,
        controlsId: "inspector",
        onCloseControls: () => setOpen(false),
        previewSlot: createElement("p", null, "Selected frame"),
        shotListSlot: createElement("p", null, "Board sequence"),
        inspectorSlot: createElement("button", null, "Generate video"),
      }),
    );
  }
  render(createElement(Workspace));
  expect(
    screen.getByRole("region", { name: "Shot preview" }).textContent,
  ).toContain("Selected frame");
  expect(
    screen.getByRole("region", { name: "Shot sequence" }).textContent,
  ).toContain("Board sequence");
  expect(screen.queryByRole("button", { name: "Generate video" })).toBeNull();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Shot controls" }));
  expect(screen.getByRole("button", { name: "Generate video" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Shot controls" }));
  expect(screen.queryByRole("button", { name: "Generate video" })).toBeNull();
});
