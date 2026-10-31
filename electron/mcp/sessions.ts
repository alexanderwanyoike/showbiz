import { request } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import { readdir, readFile, lstat } from "node:fs/promises";
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
  return (
    process.env.SHOWBIZ_MCP_DIR ?? join(config, "showbiz", "mcp-sessions")
  );
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
  const sessions: LocalSession[] = [];
  for (const name of names.sort().slice(0, 100)) {
    if (!/^[a-f\d-]{36}\.json$/i.test(name)) continue;
    try {
      const path = join(directory, name);
      const info = await lstat(path);
      if (
        !info.isFile() ||
        info.size > 4096 ||
        (process.getuid &&
          (info.uid !== process.getuid() || info.mode % 0o100 !== 0))
      )
        continue;
      const parsed = sessionSchema.safeParse(
        JSON.parse(await readFile(path, "utf8")),
      );
      if (!parsed.success || `${parsed.data.id}.json` !== name) continue;
      process.kill(parsed.data.pid, 0);
      sessions.push(parsed.data);
    } catch {
      /* Stale descriptors cannot become selectable sessions. */
    }
  }
  return sessions;
}

export function callBridge(
  session: LocalSession,
  input: unknown,
): Promise<BridgeResult> {
  return new Promise((resolve) => {
    const payload = JSON.stringify(input);
    if (Buffer.byteLength(payload) > MAX_MESSAGE_BYTES) {
      resolve({
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: "Request exceeds the 1 MiB limit.",
        },
      });
      return;
    }
    const req = request(
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
            req.destroy();
            resolve(unavailable());
            return;
          }
          chunks.push(chunk);
        });
        res.on("error", () => resolve(unavailable()));
        res.on("end", () => {
          try {
            const parsed = resultSchema.safeParse(
              JSON.parse(Buffer.concat(chunks).toString("utf8")),
            );
            resolve(parsed.success ? parsed.data : unavailable());
          } catch {
            resolve(unavailable());
          }
        });
      },
    );
    req.setTimeout(5000, () => {
      req.destroy();
      resolve(unavailable());
    });
    req.on("error", () => resolve(unavailable()));
    req.end(payload);
  });
}
