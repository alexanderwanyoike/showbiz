import { afterEach, describe, it, expect, vi } from "vitest";
import { generateVeoVideoBlob, parseRaiFilterReasons } from "./veo-shared";

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

const http = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("./http", () => http);
afterEach(() => vi.useRealTimers());
it("explains a malformed Veo operation instead of exposing schema errors", async () => {
  http.fetch.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        done: "error",
        error: { message: { message: "Model access denied" } },
      }),
    ),
  );
  await expect(
    generateVeoVideoBlob("morning", null, "key", {
      modelId: "test",
      modelName: "Veo",
    }),
  ).rejects.toThrow("Model access denied");
});
it("ends polling promptly on denied Veo access and preserves the operation identity", async () => {
  vi.useFakeTimers();
  http.fetch.mockReset();
  http.fetch
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ name: "operations/test-job" })),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { message: "Permission denied" } }),
        { status: 403 },
      ),
    );
  const pending = generateVeoVideoBlob("morning", null, "key", {
    modelId: "test",
    modelName: "Veo",
  }).then(
    () => null,
    (error: unknown) => error,
  );
  await vi.runAllTimersAsync();
  expect(await pending).toEqual(
    expect.objectContaining({
      message: expect.stringMatching(/Permission denied.*operations\/test-job/),
    }),
  );
  expect(http.fetch).toHaveBeenCalledTimes(2);
});
