// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { applicationWork } from "../lib/application-work";
import { ApplicationClosingDialog } from "./ApplicationClosingDialog";

afterEach(() => { cleanup(); applicationWork.receive({ active: [], unsaved: [], closing: false }); });
it("prevents new edits during installer staging and restores the app after failure", async () => {
  render(createElement(ApplicationClosingDialog));
  expect(screen.queryByRole("dialog")).toBeNull();
  act(() => applicationWork.receive({ active: [], unsaved: [], closing: true }));
  const dialog = screen.getByRole("dialog", { name: "Showbiz is closing" });
  expect(dialog.contains(document.activeElement)).toBe(true);
  expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  await userEvent.setup().keyboard("{Escape}");
  expect(screen.getByRole("dialog")).toBe(dialog);
  act(() => applicationWork.receive({ active: [], unsaved: [], closing: false }));
  expect(screen.queryByRole("dialog")).toBeNull();
});
