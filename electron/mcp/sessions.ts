import { request, type ClientRequest } from "node:http";
import { homedir, tmpdir } from "node:os";
import { join, dirname, basename, resolve } from "node:path";
import { readdir, readFile, lstat, unlink, rmdir } from "node:fs/promises";
import {
  sessionSchema,
  resultSchema,
  MAX_MESSAGE_BYTES,
  unavailable,
  type LocalSession,
  type BridgeResult,
} from "./contract.js";

export function sessionDirectory(): string {
  const config = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  return process.env.SHOWBIZ_MCP_DIR ?? join(config, "showbiz", "mcp-sessions");
}

export async function listSessions(
  directory = sessionDirectory(),
): Promise<LocalSession[]> {
  let names: string[];
  try {
    names = await readdir(directory);
  } catch {
    return [];
  }
  const sessions = await Promise.all(
    names
      .sort()
      .slice(0, 100)
      .map(async (name): Promise<LocalSession | null> => {
        if (!/^[a-f\d-]{36}\.json$/i.test(name)) return null;
        try {
          const path = join(directory, name);
          const info = await lstat(path);
          if (
            !info.isFile() ||
            info.size > 4096 ||
            (process.getuid &&
              (info.uid !== process.getuid() || info.mode % 0o100 !== 0))
          )
            return null;
          const contents = await readFile(path, "utf8");
          const parsed = sessionSchema.safeParse(JSON.parse(contents));
          if (!parsed.success || `${parsed.data.id}.json` !== name) return null;
          const health = await probeSession(parsed.data);
          if (health === "alive") return parsed.data;
          if (
            health === "stale" &&
            (await readFile(path, "utf8")) === contents
          ) {
            await unlink(path);
            await removeStaleSocket(parsed.data.socket);
          }
        } catch {
          // Unreadable or untrusted descriptors cannot become selectable sessions.
        }
        return null;
      }),
  );
  return sessions.filter(
    (session): session is LocalSession => session !== null,
  );
}

function probeSession(
  session: LocalSession,
): Promise<"alive" | "stale" | "uncertain"> {
  return new Promise((resolveHealth) => {
    const pending = request(
      {
        socketPath: session.socket,
        path: "/health",
        method: "GET",
        headers: { authorization: `Bearer ${session.secret}` },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let bytes = 0;
        response.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 4096) {
            resolveHealth("uncertain");
            pending.destroy();
            return;
          }
          chunks.push(chunk);
        });
        response.on("error", () => resolveHealth("uncertain"));
        response.on("end", () => {
          try {
            const parsed = resultSchema.safeParse(
              JSON.parse(Buffer.concat(chunks).toString("utf8")),
            );
            const value =
              parsed.success && parsed.data.ok ? parsed.data.value : null;
            resolveHealth(
              response.statusCode === 200 &&
                typeof value === "object" &&
                value !== null &&
                "id" in value &&
                value.id === session.id &&
                "pid" in value &&
                value.pid === session.pid
                ? "alive"
                : "uncertain",
            );
          } catch {
            resolveHealth("uncertain");
          }
        });
      },
    );
    pending.setTimeout(500, () => {
      resolveHealth("uncertain");
      pending.destroy();
    });
    pending.on("error", (error: NodeJS.ErrnoException) =>
      resolveHealth(
        error.code === "ENOENT" || error.code === "ECONNREFUSED"
          ? "stale"
          : "uncertain",
      ),
    );
    pending.end();
  });
}

async function removeStaleSocket(socket: string): Promise<void> {
  if (process.platform === "win32") return;
  const directory = dirname(socket);
  if (
    basename(socket) !== "app.sock" ||
    dirname(directory) !== resolve(tmpdir()) ||
    !/^showbiz-mcp-[a-zA-Z\d]{6}$/.test(basename(directory))
  )
    return;
  try {
    const folder = await lstat(directory);
    if (
      !folder.isDirectory() ||
      (process.getuid &&
        (folder.uid !== process.getuid() || folder.mode % 0o100 !== 0))
    )
      return;
    try {
      const info = await lstat(socket);
      if (!info.isSocket() || (process.getuid && info.uid !== process.getuid()))
        return;
      await unlink(socket);
    } catch (error) {
      if (!(
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ))
        return;
    }
    await rmdir(directory);
  } catch {
    // Another process may already have removed or reclaimed the stale path.
  }
}

export function callBridge(
  session: LocalSession,
  input: unknown,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<BridgeResult> {
  return new Promise((resolve) => {
    let pending: ClientRequest | undefined;
    let settled = false;
    const abort = () => {
      finish({
        ok: false,
        error: {
          code: "CANCELLED",
          message:
            "Stopped waiting for Showbiz. The operation may still finish. Retry with the same request ID and arguments to check the result.",
        },
      });
      pending?.destroy();
    };
    const finish = (result: BridgeResult) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener("abort", abort);
      resolve(result);
    };
    if (options.signal?.aborted) {
      abort();
      return;
    }
    let payload: string;
    try {
      const encoded = JSON.stringify(input);
      if (encoded === undefined) throw new Error("Missing request");
      payload = encoded;
    } catch {
      finish({
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: "The local request must be JSON.",
        },
      });
      return;
    }
    if (Buffer.byteLength(payload) > MAX_MESSAGE_BYTES) {
      finish({
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: "Request exceeds the 1 MiB limit.",
        },
      });
      return;
    }
    pending = request(
      {
        socketPath: session.socket,
        method: "POST",
        path: "/tools",
        headers: {
          authorization: `Bearer ${session.secret}`,
          "content-type": "application/json",
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let bytes = 0;
        res.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > MAX_MESSAGE_BYTES) {
            finish(unavailable());
            pending?.destroy();
            return;
          }
          chunks.push(chunk);
        });
        res.on("error", () => finish(unavailable()));
        res.on("end", () => {
          try {
            const parsed = resultSchema.safeParse(
              JSON.parse(Buffer.concat(chunks).toString("utf8")),
            );
            finish(parsed.success ? parsed.data : unavailable());
          } catch {
            finish(unavailable());
          }
        });
      },
    );
    pending.setTimeout(options.timeoutMs ?? 5000, () => {
      finish({
        ok: false,
        error: {
          code: "TIMEOUT",
          message:
            "Showbiz has not finished this request. The operation may still complete. Retry with the same request ID and arguments before starting it again.",
        },
      });
      pending?.destroy();
    });
    pending.on("error", () => finish(unavailable()));
    options.signal?.addEventListener("abort", abort, { once: true });
    pending.end(payload);
  });
}
