import { beforeEach, vi } from "vitest";

class TestResizeObserver implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  // JSDOM has no layout engine, but Radix subscribes when a tooltip opens.
  if (typeof window !== "undefined" && typeof ResizeObserver === "undefined") {
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
  }
});
