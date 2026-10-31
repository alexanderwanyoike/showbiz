// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { StoryboardSettingsDialog } from "../components/StoryboardSettingsDialog";
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });

afterEach(cleanup);
it("discards a cancelled storyboard draft and retains a failed draft for retry", async () => {
  const save = vi.fn(async () => ({
    ok: false as const,
    error: { code: "IO_ERROR" as const, message: "Could not save settings." },
  }));
  render(
    createElement(StoryboardSettingsDialog, {
      name: "Opening",
      defaults: { image_model: "nano-banana-2", video_model: "seedance-2-fal" },
      onSave: save,
    }),
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Storyboard settings" }));
  await user.clear(screen.getByRole("textbox", { name: "Storyboard name" }));
  await user.type(
    screen.getByRole("textbox", { name: "Storyboard name" }),
    "Discarded name",
  );
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(save).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Storyboard settings" }));
  expect(
    screen.getByRole("textbox", { name: "Storyboard name" }),
  ).toHaveProperty("value", "Opening");
  await user.clear(screen.getByRole("textbox", { name: "Storyboard name" }));
  await user.type(
    screen.getByRole("textbox", { name: "Storyboard name" }),
    "Morning",
  );
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "Could not save settings.",
  );
  expect(
    screen.getByRole("textbox", { name: "Storyboard name" }),
  ).toHaveProperty("value", "Morning");
  expect(screen.getByRole("button", { name: "Save" })).toHaveProperty(
    "disabled",
    false,
  );
});
