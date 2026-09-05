// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useUnsavedWork } from "./useApplicationWork";
import { applicationWork } from "../lib/application-work";

afterEach(cleanup);
function Editor({ open, value }: { open: boolean; value: string }) {
  useUnsavedWork("draft", open && !!value, value);
  return null;
}
it("registers actual draft changes synchronously and removes closed or unmounted editors", () => {
  const view = render(createElement(Editor, { open: true, value: "unsaved" }));
  expect(applicationWork.snapshot().unsaved).toEqual(["draft"]);
  const revision = applicationWork.snapshot().revision;
  view.rerender(createElement(Editor, { open: true, value: "changed" }));
  expect(applicationWork.snapshot().revision).toBeGreaterThan(revision);
  view.rerender(createElement(Editor, { open: false, value: "changed" }));
  expect(applicationWork.snapshot().unsaved).toEqual([]);
  view.rerender(createElement(Editor, { open: true, value: "changed" }));
  act(() => view.unmount());
  expect(applicationWork.snapshot().unsaved).toEqual([]);
});
