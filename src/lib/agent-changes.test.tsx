// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useAgentChanges } from "../hooks/useAgentChanges";
import { connectAgentChanges } from "./agent-changes";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("refreshes the displayed project after an agent edit and removes listeners on unmount", () => {
  let changed: (() => void) | undefined;
  const unsubscribe = vi.fn();
  vi.stubGlobal("window", Object.assign(window, { showbiz: { onDataChanged: (handler: () => void) => { changed = handler; return unsubscribe; } } }));
  const disconnect = connectAgentChanges();
  const refresh = vi.fn();
  function View() { useAgentChanges(refresh); return createElement("div"); }
  const view = render(createElement(View));
  changed?.();
  expect(refresh).toHaveBeenCalledTimes(1);
  view.unmount();
  changed?.();
  expect(refresh).toHaveBeenCalledTimes(1);
  disconnect();
  expect(unsubscribe).toHaveBeenCalledOnce();
});
