// @vitest-environment jsdom
import { createElement, createRef } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { WorkspaceCommand } from "../components/WorkspaceCommand";
afterEach(cleanup);
it("keeps a disabled command's reason reachable by keyboard without activating it", async () => {
  const action = vi.fn();
  render(
    createElement(
      "div",
      null,
      createElement(
        WorkspaceCommand,
        {
          label: "Export",
          title: "Save or discard the unsaved shot settings first.",
          disabled: true,
          onClick: action,
        },
        "Export",
      ),
      createElement("button", null, "Next action"),
    ),
  );
  const user = userEvent.setup();
  await user.tab();
  const command = screen.getByRole("button", { name: "Export" });
  expect(document.activeElement).toBe(command);
  expect(command.getAttribute("aria-disabled")).toBe("true");
  expect(
    await screen.findByRole("tooltip", {
      name: "Save or discard the unsaved shot settings first.",
    }),
  ).toBeTruthy();
  await user.keyboard("{Enter} ");
  await user.click(command);
  expect(action).not.toHaveBeenCalled();
  await user.tab();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Next action" }),
  );
});
it("also exposes the disabled reason on pointer hover", async () => {
  render(
    createElement(
      WorkspaceCommand,
      { label: "Shot controls", title: "Choose a shot first.", disabled: true },
      "Controls",
    ),
  );
  await userEvent
    .setup()
    .hover(screen.getByRole("button", { name: "Shot controls" }));
  expect(
    await screen.findByRole("tooltip", { name: "Choose a shot first." }),
  ).toBeTruthy();
});

it("preserves the command node, ref and keyboard focus when availability changes", async () => {
  const ref = createRef<HTMLButtonElement>();
  const action = vi.fn();
  const view = (disabled: boolean) => createElement(WorkspaceCommand, { ref, label: "Export", disabled, title: "Export is running.", onClick: action }, "Export");
  const { rerender } = render(view(false));
  const user = userEvent.setup();
  await user.tab();
  const command = screen.getByRole("button", { name: "Export" });
  rerender(view(true));
  expect(screen.getByRole("button", { name: "Export" })).toBe(command);
  expect(ref.current).toBe(command);
  expect(document.activeElement).toBe(command);
  await user.keyboard("{Enter} ");
  expect(action).not.toHaveBeenCalled();
  rerender(view(false));
  expect(ref.current).toBe(command);
  await user.keyboard("{Enter}");
  expect(action).toHaveBeenCalledTimes(1);
});
