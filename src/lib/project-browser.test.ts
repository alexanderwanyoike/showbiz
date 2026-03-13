import { describe, expect, it } from "vitest";
import {
  formatProjectUpdatedAt,
  getProjectBrowserSummary,
} from "./project-browser";

describe("formatProjectUpdatedAt", () => {
  it("formats the project update date for the browser surface", () => {
    expect(formatProjectUpdatedAt("2026-03-13T10:20:30.000Z")).toBe(
      "Updated Mar 13, 2026"
    );
  });
});

describe("getProjectBrowserSummary", () => {
  it("returns a singular summary when there is one project", () => {
    expect(getProjectBrowserSummary(1)).toBe("1 project ready to edit");
  });

  it("returns a plural summary when there are multiple projects", () => {
    expect(getProjectBrowserSummary(4)).toBe("4 projects ready to edit");
  });

  it("returns an empty-state summary when there are no projects", () => {
    expect(getProjectBrowserSummary(0)).toBe(
      "Create a project to start building a sequence"
    );
  });
});
