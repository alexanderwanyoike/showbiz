import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseFalError,
  submitFalQueue,
  submitFalQueueRequest,
  pollFalResult,
  runFalInference,
  uploadImageToFal,
} from "./fal-shared";

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
    ).rejects.toThrow(
      "fal.ai queue submit failed for fal-ai/flux/schnell: Invalid fal.ai API key."
    );
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

describe("submitFalQueueRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns request urls from the fal queue response", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        request_id: "req-123",
        status_url: "https://queue.fal.run/status-url",
        response_url: "https://queue.fal.run/response-url",
      }) as Awaited<ReturnType<typeof fetch>>
    );

    const result = await submitFalQueueRequest(
      "bytedance/seedance-2.0/reference-to-video",
      { prompt: "test" },
      "key"
    );

    expect(result).toEqual({
      requestId: "req-123",
      statusUrl: "https://queue.fal.run/status-url",
      responseUrl: "https://queue.fal.run/response-url",
    });
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
    expect(mockFetch).toHaveBeenLastCalledWith(
      "https://queue.fal.run/fal-ai/flux/schnell/requests/req-123",
      { headers: { Authorization: "Key key" } }
    );
    expect(mockFetch).toHaveBeenCalledWith(
      "https://queue.fal.run/fal-ai/flux/schnell/requests/req-123/status",
      { headers: { Authorization: "Key key" } }
    );
  });

  it("uses submit-provided status and response urls", async () => {
    mockFetch.mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr === "https://queue.fal.run/custom-status") {
        return jsonResponse({ status: "COMPLETED" }) as Awaited<ReturnType<typeof fetch>>;
      }
      if (urlStr === "https://queue.fal.run/custom-response") {
        return jsonResponse({ images: [{ url: "https://cdn.fal.ai/img.png" }] }) as Awaited<ReturnType<typeof fetch>>;
      }
      return textResponse("", 404) as unknown as Awaited<ReturnType<typeof fetch>>;
    });

    const result = await pollFalResult<{ images: Array<{ url: string }> }>(
      "bytedance/seedance-2.0/reference-to-video",
      "req-123",
      "key",
      {
        statusUrl: "https://queue.fal.run/custom-status",
        responseUrl: "https://queue.fal.run/custom-response",
      }
    );

    expect(result.images[0].url).toBe("https://cdn.fal.ai/img.png");
  });

  it("retries status with POST when the live queue endpoint rejects documented GET with 405", async () => {
    mockFetch
      .mockResolvedValueOnce(textResponse("", 405) as unknown as Awaited<ReturnType<typeof fetch>>)
      .mockResolvedValueOnce(jsonResponse({ status: "COMPLETED" }) as Awaited<ReturnType<typeof fetch>>)
      .mockResolvedValueOnce(jsonResponse({ images: [{ url: "https://cdn.fal.ai/img.png" }] }) as Awaited<ReturnType<typeof fetch>>);

    await pollFalResult("bytedance/seedance-2.0/reference-to-video", "req-123", "key");

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      "https://queue.fal.run/bytedance/seedance-2.0/reference-to-video/requests/req-123/status",
      { headers: { Authorization: "Key key" } }
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "https://queue.fal.run/bytedance/seedance-2.0/reference-to-video/requests/req-123/status",
      { method: "POST", headers: { Authorization: "Key key" } }
    );
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

  it("throws immediately on a definitive 4xx status check error", async () => {
    mockFetch.mockResolvedValue(
      textResponse("Not found", 404) as unknown as Awaited<ReturnType<typeof fetch>>
    );

    const promise = pollFalResult("fal-ai/flux/schnell", "req-123", "key");
    const error = await promise.catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe(
      "fal.ai queue status failed for fal-ai/flux/schnell request req-123: Not found"
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("keeps polling through a transient network error and still resolves", async () => {
    let statusCalls = 0;
    mockFetch.mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/status")) {
        statusCalls++;
        if (statusCalls === 1) throw new Error("Network error: socket hang up");
        return jsonResponse({ status: "COMPLETED" }) as Awaited<ReturnType<typeof fetch>>;
      }
      return jsonResponse({ video: { url: "https://cdn.fal.ai/out.mp4" } }) as Awaited<
        ReturnType<typeof fetch>
      >;
    });

    const promise = pollFalResult<{ video: { url: string } }>(
      "fal-ai/veo3.1/first-last-frame-to-video",
      "req-9",
      "key"
    );
    await vi.advanceTimersByTimeAsync(0); // first check: network error, retried
    await vi.advanceTimersByTimeAsync(2000); // second check: COMPLETED + result

    const result = await promise;
    expect(result.video.url).toBe("https://cdn.fal.ai/out.mp4");
  });

  it("keeps polling through fal 5xx and 429 status blips", async () => {
    let statusCalls = 0;
    mockFetch.mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/status")) {
        statusCalls++;
        if (statusCalls === 1)
          return textResponse("Bad gateway", 502) as unknown as Awaited<ReturnType<typeof fetch>>;
        if (statusCalls === 2)
          return textResponse("Rate limited", 429) as unknown as Awaited<ReturnType<typeof fetch>>;
        return jsonResponse({ status: "COMPLETED" }) as Awaited<ReturnType<typeof fetch>>;
      }
      return jsonResponse({ images: [{ url: "https://cdn.fal.ai/img.png" }] }) as Awaited<
        ReturnType<typeof fetch>
      >;
    });

    const promise = pollFalResult<{ images: Array<{ url: string }> }>(
      "fal-ai/flux/schnell",
      "req-123",
      "key"
    );
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(4000);

    const result = await promise;
    expect(result.images[0].url).toBe("https://cdn.fal.ai/img.png");
  });

  it("gives up after persistent consecutive network failures, naming the request id", async () => {
    mockFetch.mockRejectedValue(new Error("Network error: request timed out"));

    const promise = pollFalResult("fal-ai/veo3.1/first-last-frame-to-video", "req-9", "key");
    const captured = promise.catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(4000);
    await vi.advanceTimersByTimeAsync(8000);
    await vi.advanceTimersByTimeAsync(8000);

    const error = await captured;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("req-9");
    expect((error as Error).message).toContain("may still be running");
    expect(mockFetch).toHaveBeenCalledTimes(5);
  });

  it("reports result fetch stage and endpoint on HTTP error", async () => {
    mockFetch.mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/status")) {
        return jsonResponse({ status: "COMPLETED" }) as Awaited<ReturnType<typeof fetch>>;
      }
      return textResponse("", 405) as unknown as Awaited<ReturnType<typeof fetch>>;
    });

    const promise = pollFalResult("fal-ai/flux/schnell", "req-123", "key");
    const error = await promise.catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe(
      "fal.ai queue result failed for fal-ai/flux/schnell request req-123: fal.ai error (405)"
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});

describe("runFalInference", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts directly to fal.run and returns the JSON response", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ images: [{ url: "https://fal.media/out.jpg" }] }) as Awaited<ReturnType<typeof fetch>>
    );

    const result = await runFalInference(
      "fal-ai/flux-pro/kontext",
      { prompt: "edit", image_url: "data:image/png;base64,abc" },
      "key"
    );

    expect(result).toEqual({ images: [{ url: "https://fal.media/out.jpg" }] });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://fal.run/fal-ai/flux-pro/kontext",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Key key",
        },
        body: JSON.stringify({ prompt: "edit", image_url: "data:image/png;base64,abc" }),
      }
    );
  });

  it("reports direct inference errors with endpoint context", async () => {
    mockFetch.mockResolvedValue(
      textResponse("", 405) as unknown as Awaited<ReturnType<typeof fetch>>
    );

    await expect(
      runFalInference("fal-ai/flux-pro/kontext", { prompt: "edit" }, "key")
    ).rejects.toThrow("fal.ai inference failed for fal-ai/flux-pro/kontext: fal.ai error (405)");
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
