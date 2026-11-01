// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useLocalDrafts } from "../hooks/useApplicationWork";
import { applicationWork } from "./application-work";
function Probe() { return createElement("output", null, useLocalDrafts() ? "dirty" : "clean"); }
afterEach(() => { cleanup(); applicationWork.receive({ active: [], unsaved: [], closing: false }); });
it("subscribes to local draft truth without treating delayed native echoes as this workspace's input", () => {
  const owner = Symbol("draft");
  render(createElement(Probe));
  expect(screen.getByText("clean")).toBeTruthy();
  act(() => applicationWork.setUnsaved(owner, "draft"));
  expect(screen.getByText("dirty")).toBeTruthy();
  act(() => applicationWork.receive({ active: [], unsaved: ["draft"], closing: false }));
  act(() => applicationWork.setUnsaved(owner, null));
  expect(screen.getByText("clean")).toBeTruthy();
  expect(applicationWork.getStatus().unsaved).toEqual(["draft"]);
});
