import { describe, it, expect } from "vitest";
import { parseGoogleApiError } from "./types";

describe("parseGoogleApiError", () => {
  it("handles 429 quota error", () => {
    const json = JSON.stringify({
      error: { message: "Resource has been exhausted", status: "RESOURCE_EXHAUSTED" },
    });
    const result = parseGoogleApiError(json, 429);
    expect(result).toContain("API quota");
  });

  it("handles RESOURCE_EXHAUSTED status without 429", () => {
    const json = JSON.stringify({
      error: { message: "Quota exceeded", status: "RESOURCE_EXHAUSTED" },
    });
    const result = parseGoogleApiError(json);
    expect(result).toContain("API quota");
  });

  it("handles celebrity block", () => {
    const json = JSON.stringify({
      error: { message: "Cannot generate images of celebrity faces" },
    });
    const result = parseGoogleApiError(json);
    expect(result).toContain("real people");
  });

  it("handles safety filter", () => {
    const json = JSON.stringify({
      error: { message: "Content was blocked by safety filters" },
    });
    const result = parseGoogleApiError(json);
    expect(result).toContain("safety filters");
  });

  it("returns generic JSON error message", () => {
    const json = JSON.stringify({
      error: { message: "Something went wrong" },
    });
    const result = parseGoogleApiError(json);
    expect(result).toBe("Something went wrong");
  });

  it("handles non-JSON error text", () => {
    const result = parseGoogleApiError("429 Too Many Requests quota exceeded");
    expect(result).toContain("API quota");
  });

  it("passes through unknown error text", () => {
    const result = parseGoogleApiError("Some random error");
    expect(result).toBe("Some random error");
  });
});
