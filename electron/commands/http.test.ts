import { describe, it, expect, vi } from "vitest";
import { createHttpCommands } from "./http";

/**
 * Builds a minimal fetch Response stand-in. The port only reads `status` and
 * `arrayBuffer()`, matching what the Rust command consumes (status + bytes).
 */
function fakeResponse(status: number, body: string | Uint8Array) {
  const bytes =
    typeof body === "string" ? new TextEncoder().encode(body) : body;
  return {
    status,
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}

function decode(b64: string): string {
  return Buffer.from(b64, "base64").toString("utf-8");
}

describe("http_request", () => {
  it("maps a 2xx response to { status, body_b64 } with base64 body", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      fakeResponse(200, '{"hello":"world"}')
    );
    const { http_request } = createHttpCommands(fetchFn);

    const result = (await http_request({
      url: "https://api.example.com/thing",
      method: "GET",
      headers: [],
      body: null,
    })) as { status: number; body_b64: string };

    expect(result.status).toBe(200);
    expect(decode(result.body_b64)).toBe('{"hello":"world"}');
  });

  it("passes url, method, headers and body through to fetch", async () => {
    const fetchFn = vi.fn().mockResolvedValue(fakeResponse(201, "ok"));
    const { http_request } = createHttpCommands(fetchFn);

    await http_request({
      url: "https://api.example.com/create",
      method: "POST",
      headers: [
        ["Authorization", "Bearer token"],
        ["Content-Type", "application/json"],
      ],
      body: '{"a":1}',
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.example.com/create");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual([
      ["Authorization", "Bearer token"],
      ["Content-Type", "application/json"],
    ]);
    expect(init.body).toBe('{"a":1}');
  });

  it("omits the body from the fetch init when body is null", async () => {
    const fetchFn = vi.fn().mockResolvedValue(fakeResponse(200, ""));
    const { http_request } = createHttpCommands(fetchFn);

    await http_request({
      url: "https://api.example.com/thing",
      method: "GET",
      headers: [],
      body: null,
    });

    const [, init] = fetchFn.mock.calls[0];
    expect("body" in init).toBe(false);
  });

  it("returns the status for non-2xx responses instead of rejecting", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(fakeResponse(404, "not found"));
    const { http_request } = createHttpCommands(fetchFn);

    const result = (await http_request({
      url: "https://api.example.com/missing",
      method: "GET",
      headers: [],
      body: null,
    })) as { status: number; body_b64: string };

    expect(result.status).toBe(404);
    expect(decode(result.body_b64)).toBe("not found");
  });

  it("round-trips binary bytes through base64", async () => {
    const bytes = new Uint8Array([0, 255, 16, 128, 42]);
    const fetchFn = vi.fn().mockResolvedValue(fakeResponse(200, bytes));
    const { http_request } = createHttpCommands(fetchFn);

    const result = (await http_request({
      url: "https://api.example.com/binary",
      method: "GET",
      headers: [],
      body: null,
    })) as { status: number; body_b64: string };

    expect(Array.from(Buffer.from(result.body_b64, "base64"))).toEqual([
      0, 255, 16, 128, 42,
    ]);
  });

  it("throws a Network error when fetch rejects", async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));
    const { http_request } = createHttpCommands(fetchFn);

    await expect(
      http_request({
        url: "https://nope.invalid/",
        method: "GET",
        headers: [],
        body: null,
      })
    ).rejects.toThrow(/Network error: getaddrinfo ENOTFOUND/);
  });

  it("throws when reading the response body fails", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      status: 200,
      arrayBuffer: async () => {
        throw new Error("stream aborted");
      },
    });
    const { http_request } = createHttpCommands(fetchFn);

    await expect(
      http_request({
        url: "https://api.example.com/thing",
        method: "GET",
        headers: [],
        body: null,
      })
    ).rejects.toThrow(/Failed to read response body: stream aborted/);
  });

  it("defaults to the global fetch when none is injected", () => {
    const commands = createHttpCommands();
    expect(typeof commands.http_request).toBe("function");
  });
});
