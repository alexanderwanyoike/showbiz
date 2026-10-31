// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import StoryboardCard from "../components/StoryboardCard";
afterEach(cleanup);
it("keeps storyboard actions discoverable and leaves a failed deletion available to retry", async () => {
  const remove = vi.fn(async () => ({ ok: false as const, error: { code: "IO_ERROR" as const, message: "Could not delete storyboard." } }));
  render(createElement(MemoryRouter, null, createElement(StoryboardCard, { id: "opening", name: "Opening", updatedAt: "2026-10-31", onDelete: remove })));
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Storyboard actions for Opening" }));
  await user.click(screen.getByRole("menuitem", { name: "Delete storyboard…" }));
  const dialog = await screen.findByRole("alertdialog", { name: "Delete storyboard" });
  await user.click(within(dialog).getByRole("button", { name: "Delete storyboard" }));
  expect(remove).toHaveBeenCalledWith("opening");
  expect(await within(dialog).findByRole("alert")).toHaveProperty("textContent", "Could not delete storyboard.");
  expect(screen.getByRole("alertdialog", { name: "Delete storyboard" })).toBeTruthy();
  expect(within(dialog).getByRole("button", { name: "Delete storyboard" }).hasAttribute("disabled")).toBe(false);
});
