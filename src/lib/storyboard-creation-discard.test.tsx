// @vitest-environment jsdom
import { useRef, useState } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { NewStoryboardDialog } from "../components/NewStoryboardDialog";
import { createStoryboard, type Storyboard } from "./backend-api";
vi.mock("./backend-api", () => ({ createStoryboard: vi.fn() }));
afterEach(cleanup);
it("allows a fresh creation after discarding an unfinished save and ignores its late completion", async () => {
  const completions: ((board: Storyboard) => void)[] = [];
  vi.mocked(createStoryboard).mockImplementation(() => new Promise((resolve) => { completions.push(resolve); }));
  const created = vi.fn();
  function Harness() {
    const [open, setOpen] = useState(true);
    const opener = useRef<HTMLButtonElement>(null);
    return <><button ref={opener} onClick={() => setOpen(true)}>New storyboard</button><NewStoryboardDialog open={open} onOpenChange={setOpen} projectId="film" projectName="Morning" opener={opener} onCreated={created} /></>;
  }
  render(<Harness />);
  const user = userEvent.setup();
  await user.type(screen.getByRole("textbox", { name: "Storyboard name" }), "Old board{Enter}");
  act(() => { window.dispatchEvent(new Event("showbiz:discard-workspace-drafts")); });
  await user.click(screen.getByRole("button", { name: "New storyboard" }));
  const name = screen.getByRole("textbox", { name: "Storyboard name" });
  expect(name).toHaveProperty("disabled", false);
  expect(screen.getByRole("button", { name: "Cancel" })).toHaveProperty("disabled", false);
  await user.type(name, "New board{Enter}");
  await act(async () => { completions[0]({ id: "old", name: "Old board" } as Storyboard); });
  expect(name).toHaveProperty("disabled", true);
  expect(created).not.toHaveBeenCalled();
  await act(async () => { completions[1]({ id: "new", name: "New board" } as Storyboard); });
  expect(created).toHaveBeenCalledWith(expect.objectContaining({ id: "new" }));
});
