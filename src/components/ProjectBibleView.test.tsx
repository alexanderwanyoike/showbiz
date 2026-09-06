// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import ProjectBibleView from "./ProjectBibleView";
import { applicationWork } from "../lib/application-work";

const createAsset = vi.hoisted(() => vi.fn());
vi.mock("../lib/backend-api", async (importOriginal) => ({
  ...await importOriginal<typeof import("../lib/backend-api")>(),
  getBibles: async () => [{ id: "bible-1" }], getBibleAssets: async () => [], createBibleAsset: createAsset,
}));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("shows saving work for an uploaded character instead of generation", async () => {
  let fail!: (error: Error) => void;
  createAsset.mockImplementation(() => new Promise((_, reject) => { fail = reject; }));
  vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (this: HTMLInputElement) {
    if (this.type === "file") {
      Object.defineProperty(this, "files", { value: [new File(["image"], "character.png", { type: "image/png" })] });
      this.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  const user = userEvent.setup();
  render(createElement(ProjectBibleView, { projectId: "project-1" }));
  await user.type(await screen.findByPlaceholderText("character name"), "Ada");
  try {
    await user.click(screen.getByRole("button", { name: "Upload character picture" }));
    await waitFor(() => expect(createAsset).toHaveBeenCalledOnce());
    expect(applicationWork.getStatus().active).toEqual(["saving"]);
  } finally {
    await act(async () => { fail?.(new Error("Upload cancelled")); });
  }
  await waitFor(() => expect(applicationWork.getStatus().active).toEqual([]));
});
