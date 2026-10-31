// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Header } from "../components/Header";
vi.mock("../hooks/useUpdates", () => ({ useUpdates: () => ({ status: null }) }));
vi.mock("../components/SettingsDialog", () => ({ SettingsDialog: () => null }));
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
it("reuses the app icon's monochrome symbol at titlebar size with a packaged-relative URL", () => {
  vi.stubEnv("BASE_URL", "./");
  render(createElement(Header));
  const wordmark = screen.getByLabelText("Showbiz");
  const mark = wordmark.querySelector("svg");
  expect(mark?.getAttribute("viewBox")).toBe("0 0 64 64");
  expect(mark?.getAttribute("width")).toBe("20");
  expect(mark?.getAttribute("height")).toBe("20");
  expect(mark?.getAttribute("aria-hidden")).toBe("true");
  expect(mark?.getAttribute("focusable")).toBe("false");
  expect(mark?.querySelector("use")?.getAttribute("href")).toBe("./icon.svg#showbiz-mark");
  expect(wordmark.textContent).toBe("Showbiz");
});
