import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createPrediction,
  pollPrediction,
  downloadReplicateOutput,
  parseReplicateError,
} from "./replicate-shared";

vi.mock("./http", () => ({
  fetch: vi.fn(),
}));

// Must import after mock setup so vi.mocked works
import { fetch } from "./http";

const mockedFetch = vi.mocked(fetch);

function mockResponse(
  status: number,
  body: unknown,
  ok?: boolean
) {
  return {
    ok: ok ?? (status >= 200 && status < 300),
    status,
    text: vi.fn().mockResolvedValue(
      typeof body === "string" ? body : JSON.stringify(body)
    ),
    json: vi.fn().mockResolvedValue(body),
    blob: vi.fn().mockResolvedValue(body),
  };
}

describe("parseReplicateError", () => {
  it("maps 401 to invalid token", () => {
    expect(parseReplicateError(401, "")).toBe("Invalid Replicate API token.");
  });

  it("maps 402 to billing issue", () => {
    expect(parseReplicateError(402, "")).toBe(
      "Billing issue with your Replicate account."
    );
  });

  it("maps 429 to rate limit", () => {
    expect(parseReplicateError(429, "")).toBe(
      "Replicate rate limit exceeded. Please try again later."
    );
  });

  it("parses 422 detail string from body", () => {
    const body = JSON.stringify({ detail: "Invalid input parameter" });
    expect(parseReplicateError(422, body)).toBe("Invalid input parameter");
  });

  it("parses 422 detail array from body", () => {
    const body = JSON.stringify({
      detail: [{ msg: "field required" }, { msg: "invalid type" }],
    });
    expect(parseReplicateError(422, body)).toBe(
      "field required; invalid type"
    );
  });

  it("falls back to body text for unknown status", () => {
    expect(parseReplicateError(500, "Internal Server Error")).toBe(
      "Internal Server Error"
    );
  });

  it("falls back to generic message when body is empty", () => {
    expect(parseReplicateError(503, "")).toBe("Replicate error (503)");
  });
});

describe("createPrediction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends correct URL, headers, and body", async () => {
    const prediction = {
      id: "pred-123",
      status: "starting",
      output: null,
    };
    mockedFetch.mockResolvedValue(mockResponse(201, prediction) as never);

    const result = await createPrediction(
      "owner/model",
      { prompt: "a cat" },
      "test-key"
    );

    expect(mockedFetch).toHaveBeenCalledWith(
      "https://api.replicate.com/v1/predictions",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer test-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "owner/model",
          input: { prompt: "a cat" },
        }),
      }
    );
    expect(result).toEqual(prediction);
  });

  it("adds Prefer: wait header when preferWait is true", async () => {
    const prediction = {
      id: "pred-456",
      status: "succeeded",
      output: "https://output.url/image.png",
    };
    mockedFetch.mockResolvedValue(mockResponse(200, prediction) as never);

    await createPrediction(
      "owner/model",
      { prompt: "fast" },
      "test-key",
      true
    );

    expect(mockedFetch).toHaveBeenCalledWith(
      "https://api.replicate.com/v1/predictions",
      expect.objectContaining({
        headers: expect.objectContaining({
          Prefer: "wait",
        }),
      })
    );
  });

  it("throws on error response", async () => {
    mockedFetch.mockResolvedValue(
      mockResponse(401, "Unauthorized", false) as never
    );

    await expect(
      createPrediction("owner/model", {}, "bad-key")
    ).rejects.toThrow("Invalid Replicate API token.");
  });
});

describe("pollPrediction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it("handles starting -> succeeded transition", async () => {
    let callCount = 0;
    mockedFetch.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return mockResponse(200, {
          id: "pred-1",
          status: "processing",
          output: null,
        }) as never;
      }
      return mockResponse(200, {
        id: "pred-1",
        status: "succeeded",
        output: "https://output.url/video.mp4",
      }) as never;
    });

    const promise = pollPrediction("pred-1", "test-key");

    // First check — processing
    await vi.advanceTimersByTimeAsync(0);
    // Wait for initial interval (2000ms)
    await vi.advanceTimersByTimeAsync(2000);
    // Second check — succeeded
    await vi.advanceTimersByTimeAsync(0);

    const result = await promise;
    expect(result.status).toBe("succeeded");
    expect(result.output).toBe("https://output.url/video.mp4");
  });

  it("throws on failed status", async () => {
    mockedFetch.mockResolvedValue(
      mockResponse(200, {
        id: "pred-2",
        status: "failed",
        output: null,
        error: "Model crashed",
      }) as never
    );

    const promise = pollPrediction("pred-2", "test-key");
    const resultPromise = promise.catch((e) => e);

    await vi.advanceTimersByTimeAsync(0);

    const error = await resultPromise;
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain("failed");
    expect(error.message).toContain("Model crashed");
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});

describe("downloadReplicateOutput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches URL and returns blob", async () => {
    const fakeBlob = new Blob(["video-data"], { type: "video/mp4" });
    mockedFetch.mockResolvedValue(
      mockResponse(200, fakeBlob, true) as never
    );

    const result = await downloadReplicateOutput(
      "https://replicate.delivery/output.mp4"
    );
    expect(result).toBe(fakeBlob);
    expect(mockedFetch).toHaveBeenCalledWith(
      "https://replicate.delivery/output.mp4"
    );
  });

  it("throws on download failure", async () => {
    mockedFetch.mockResolvedValue(
      mockResponse(404, "Not Found", false) as never
    );

    await expect(
      downloadReplicateOutput("https://replicate.delivery/expired.mp4")
    ).rejects.toThrow("Failed to download Replicate output: 404");
  });
});
