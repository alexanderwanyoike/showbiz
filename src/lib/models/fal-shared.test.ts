import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseFalError, submitFalQueue, pollFalResult, uploadImageToFal } from "./fal-shared";

vi.mock("./http", () => ({
  fetch: vi.fn(),
}));

// Import after mock
import { fetch } from "./http";
const mockFetch = vi.mocked(fetch);

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  };
}

function textResponse(text: string, status: number) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.reject(new Error("not json")),
    text: () => Promise.resolve(text),
  };
}

describe("parseFalError", () => {
  it("maps 401 to invalid API key", () => {
    expect(parseFalError(401, "")).toBe("Invalid fal.ai API key.");
  });

  it("maps 402 to insufficient credits", () => {
    expect(parseFalError(402, "")).toBe(
      "Insufficient fal.ai credits. Please top up your account."
    );
  });

  it("maps 429 to rate limit", () => {
    expect(parseFalError(429, "")).toBe(
      "fal.ai rate limit exceeded. Please try again later."
    );
  });

  it("returns body for other statuses", () => {
    expect(parseFalError(500, "Internal error")).toBe("Internal error");
  });

  it("returns generic message when no body", () => {
    expect(parseFalError(503, "")).toBe("fal.ai error (503)");
  });
});

describe("submitFalQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends correct URL, headers, and body", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ request_id: "req-123" }) as Awaited<ReturnType<typeof fetch>>
    );

    const result = await submitFalQueue(
      "fal-ai/flux/schnell",
      { prompt: "a cat" },
      "my-api-key"
    );

    expect(result).toBe("req-123");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://queue.fal.run/fal-ai/flux/schnell",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Key my-api-key",
        },
        body: JSON.stringify({ prompt: "a cat" }),
      }
    );
  });

  it("throws on non-ok response with parsed error", async () => {
    mockFetch.mockResolvedValue(
      textResponse("Unauthorized", 401) as unknown as Awaited<ReturnType<typeof fetch>>
    );

    await expect(
      submitFalQueue("fal-ai/flux/schnell", { prompt: "test" }, "bad-key")
    ).rejects.toThrow("Invalid fal.ai API key.");
  });

  it("throws when response has no request_id", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({}) as Awaited<ReturnType<typeof fetch>>
    );

    await expect(
      submitFalQueue("fal-ai/flux/schnell", { prompt: "test" }, "key")
    ).rejects.toThrow("fal.ai queue submit returned no request_id");
  });
});

describe("pollFalResult", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it("handles IN_QUEUE then COMPLETED transition", async () => {
    let callCount = 0;
    mockFetch.mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();

      if (urlStr.includes("/status")) {
        callCount++;
        if (callCount === 1) {
          return jsonResponse({ status: "IN_QUEUE" }) as Awaited<ReturnType<typeof fetch>>;
        }
        return jsonResponse({ status: "COMPLETED" }) as Awaited<ReturnType<typeof fetch>>;
      }

      // Result fetch
      return jsonResponse({ images: [{ url: "https://cdn.fal.ai/img.png" }] }) as Awaited<
        ReturnType<typeof fetch>
      >;
    });

    const promise = pollFalResult<{ images: Array<{ url: string }> }>(
      "fal-ai/flux/schnell",
      "req-123",
      "key"
    );

    // First check: IN_QUEUE
    await vi.advanceTimersByTimeAsync(0);
    // Wait for initial interval (2000ms)
    await vi.advanceTimersByTimeAsync(2000);
    // Second check: COMPLETED, fetches result
    await vi.advanceTimersByTimeAsync(0);

    const result = await promise;
    expect(result.images[0].url).toBe("https://cdn.fal.ai/img.png");
  });

  it("throws on FAILED status", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ status: "FAILED" }) as Awaited<ReturnType<typeof fetch>>
    );

    const promise = pollFalResult("fal-ai/flux/schnell", "req-123", "key");
    const error = await promise.catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("fal.ai generation failed");
  });

  it("throws on status check HTTP error", async () => {
    mockFetch.mockResolvedValue(
      textResponse("Rate limited", 429) as unknown as Awaited<ReturnType<typeof fetch>>
    );

    const promise = pollFalResult("fal-ai/flux/schnell", "req-123", "key");
    const error = await promise.catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("fal.ai rate limit exceeded. Please try again later.");
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});

describe("uploadImageToFal", () => {
  it("returns data URI as-is if already formatted", () => {
    const dataUri = "data:image/png;base64,abc123";
    expect(uploadImageToFal(dataUri)).toBe(dataUri);
  });

  it("wraps raw base64 in data URI", () => {
    expect(uploadImageToFal("abc123")).toBe("data:image/png;base64,abc123");
  });
});
