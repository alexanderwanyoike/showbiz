import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { pollUntilDone } from "./poll";

describe("pollUntilDone", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns immediately if first check is done", async () => {
    const check = vi.fn().mockResolvedValue({ done: true, value: "result" });

    const promise = pollUntilDone({
      check,
      initialInterval: 1000,
      maxInterval: 5000,
      timeout: 30000,
      backoff: { type: "exponential", factor: 2 },
    });

    const result = await promise;
    expect(result).toBe("result");
    expect(check).toHaveBeenCalledTimes(1);
  });

  it("polls until done with exponential backoff", async () => {
    let callCount = 0;
    const check = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount >= 3) return { done: true, value: "done" };
      return { done: false };
    });

    const promise = pollUntilDone({
      check,
      initialInterval: 1000,
      maxInterval: 10000,
      timeout: 60000,
      backoff: { type: "exponential", factor: 2 },
    });

    // First check happens immediately (returns not done)
    await vi.advanceTimersByTimeAsync(0);

    // Wait for first interval (1000ms)
    await vi.advanceTimersByTimeAsync(1000);

    // Second check returns not done, next interval = 1000*2 = 2000ms
    await vi.advanceTimersByTimeAsync(2000);

    const result = await promise;
    expect(result).toBe("done");
    expect(check).toHaveBeenCalledTimes(3);
  });

  it("polls until done with linear backoff", async () => {
    let callCount = 0;
    const check = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount >= 3) return { done: true, value: 42 };
      return { done: false };
    });

    const promise = pollUntilDone({
      check,
      initialInterval: 1000,
      maxInterval: 5000,
      timeout: 60000,
      backoff: { type: "linear", increment: 500 },
    });

    await vi.advanceTimersByTimeAsync(0);
    // interval starts at 1000
    await vi.advanceTimersByTimeAsync(1000);
    // interval becomes 1000+500=1500
    await vi.advanceTimersByTimeAsync(1500);

    const result = await promise;
    expect(result).toBe(42);
    expect(check).toHaveBeenCalledTimes(3);
  });

  it("respects maxInterval cap for exponential backoff", async () => {
    let callCount = 0;
    const check = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount >= 5) return { done: true, value: "capped" };
      return { done: false };
    });

    const promise = pollUntilDone({
      check,
      initialInterval: 1000,
      maxInterval: 3000,
      timeout: 60000,
      backoff: { type: "exponential", factor: 2 },
    });

    await vi.advanceTimersByTimeAsync(0);  // check 1
    await vi.advanceTimersByTimeAsync(1000);  // check 2, next=2000
    await vi.advanceTimersByTimeAsync(2000);  // check 3, next=min(4000,3000)=3000
    await vi.advanceTimersByTimeAsync(3000);  // check 4, next=3000 (capped)
    await vi.advanceTimersByTimeAsync(3000);  // check 5

    const result = await promise;
    expect(result).toBe("capped");
    expect(check).toHaveBeenCalledTimes(5);
  });

  it("throws on timeout", async () => {
    const check = vi.fn().mockResolvedValue({ done: false });

    const promise = pollUntilDone({
      check,
      initialInterval: 1000,
      maxInterval: 1000,
      timeout: 3000,
      backoff: { type: "linear", increment: 0 },
      label: "test-op",
    });

    // Catch the rejection early to prevent unhandled rejection
    const resultPromise = promise.catch((e) => e);

    // Advance past timeout
    await vi.advanceTimersByTimeAsync(0);    // check 1 at t=0
    await vi.advanceTimersByTimeAsync(1000); // check 2 at t=1000
    await vi.advanceTimersByTimeAsync(1000); // check 3 at t=2000
    await vi.advanceTimersByTimeAsync(1000); // check 4 at t=3000 → timeout

    const error = await resultPromise;
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Polling timed out after 3000ms (test-op)");
  });

  it("propagates errors from check function", async () => {
    const check = vi.fn().mockRejectedValue(new Error("API failure"));

    const promise = pollUntilDone({
      check,
      initialInterval: 1000,
      maxInterval: 5000,
      timeout: 30000,
      backoff: { type: "exponential", factor: 2 },
    });

    await expect(promise).rejects.toThrow("API failure");
    expect(check).toHaveBeenCalledTimes(1);
  });
});
