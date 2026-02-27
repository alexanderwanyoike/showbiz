import { describe, it, expect } from "vitest";
import { parseRaiFilterReasons } from "./veo-shared";

describe("parseRaiFilterReasons", () => {
  it("returns first reason from valid nested data", () => {
    const data = {
      response: {
        generateVideoResponse: {
          raiMediaFilteredReasons: ["Violence detected", "Other reason"],
        },
      },
    };
    expect(parseRaiFilterReasons(data)).toBe("Violence detected");
  });

  it("returns null when field is missing", () => {
    const data = {
      response: {
        generateVideoResponse: {},
      },
    };
    expect(parseRaiFilterReasons(data)).toBeNull();
  });

  it("returns null when reasons array is empty", () => {
    const data = {
      response: {
        generateVideoResponse: {
          raiMediaFilteredReasons: [],
        },
      },
    };
    expect(parseRaiFilterReasons(data)).toBeNull();
  });

  it("returns null when no response", () => {
    expect(parseRaiFilterReasons({})).toBeNull();
  });
});
