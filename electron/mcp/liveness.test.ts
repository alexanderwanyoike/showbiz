import { expect, it, vi } from "vitest";
import { mkdtemp, readFile, writeFile, rm, access } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { startLocalBridge } from "./local-bridge";
import { listSessions } from "./sessions";

it("does not trust a reused live PID and removes its stale owned descriptor", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "showbiz-mcp-liveness-"));
  const id = randomUUID();
  const file = path.join(directory, `${id}.json`);
  try {
    await writeFile(file, JSON.stringify({ id, pid: process.pid, secret: "a".repeat(64), socket: path.join(directory, "missing.sock") }), { mode: 0o600 });
    expect(await listSessions(directory)).toEqual([]);
    await expect(access(file)).rejects.toThrow();
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it("authenticates live bridge identity without dispatching application commands or trusting a copied secret", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "showbiz-mcp-liveness-"));
  const dispatch = vi.fn(async () => ({ ok: true as const, value: null }));
  const bridge = await startLocalBridge(dispatch, directory);
  try {
    expect(await listSessions(directory)).toEqual([bridge.session]);
    expect(dispatch).not.toHaveBeenCalled();
    const file = path.join(directory, `${bridge.session.id}.json`);
    const descriptor = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
    await writeFile(file, JSON.stringify({ ...descriptor, secret: "b".repeat(64) }), { mode: 0o600 });
    expect(await listSessions(directory)).toEqual([]);
    expect(dispatch).not.toHaveBeenCalled();
  } finally { await bridge.close(); await rm(directory, { recursive: true, force: true }); }
});
