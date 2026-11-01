import { expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { startLocalBridge } from "./local-bridge";
import { callBridge } from "./sessions";

it("reports a timeout without claiming the live instance disappeared", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "showbiz-mcp-timeout-"));
  let finish: () => void = () => {};
  const bridge = await startLocalBridge(
    () =>
      new Promise((resolve) => {
        finish = () => resolve({ ok: true, value: null });
      }),
    directory,
  );
  try {
    expect(
      await callBridge(
        bridge.session,
        { tool: "read_context", args: {} },
        { timeoutMs: 30 },
      ),
    ).toMatchObject({ ok: false, error: { code: "TIMEOUT", message: expect.not.stringContaining("request ID") } });
  } finally {
    finish();
    await bridge.close();
    await rm(directory, { recursive: true, force: true });
  }
});
it("cancels local waiting without claiming to cancel the application's operation", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "showbiz-mcp-abort-"));
  let finish: () => void = () => {};
  const dispatch = vi.fn(
    () =>
      new Promise<{ ok: true; value: null }>((resolve) => {
        finish = () => resolve({ ok: true, value: null });
      }),
  );
  const bridge = await startLocalBridge(dispatch, directory);
  const controller = new AbortController();
  try {
    const waiting = callBridge(
      bridge.session,
      { tool: "read_context", args: {} },
      { signal: controller.signal },
    );
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledOnce());
    controller.abort();
    expect(await waiting).toMatchObject({
      ok: false,
      error: {
        code: "CANCELLED",
        message: expect.stringContaining("may still finish"),
      },
    });
  } finally {
    finish();
    await bridge.close();
    await rm(directory, { recursive: true, force: true });
  }
});
