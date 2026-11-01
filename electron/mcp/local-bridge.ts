import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { randomUUID, randomBytes, timingSafeEqual } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { once } from "node:events";
import {
  MAX_MESSAGE_BYTES,
  type BridgeResult,
  type LocalSession,
} from "./contract";
import { sessionDirectory } from "./sessions";

type Dispatch = (input: unknown) => Promise<BridgeResult>;
export async function startLocalBridge(
  dispatch: Dispatch,
  directory = sessionDirectory(),
) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await lstat(directory);
  if (!info.isDirectory() || (process.getuid && info.uid !== process.getuid()))
    throw new Error("MCP directory must be owned by the current user");
  await chmod(directory, 0o700);
  const runtime = await mkdtemp(path.join(tmpdir(), "showbiz-mcp-"));
  await chmod(runtime, 0o700);
  const id = randomUUID();
  const session: LocalSession = {
    id,
    pid: process.pid,
    secret: randomBytes(32).toString("hex"),
    socket:
      process.platform === "win32"
        ? `\\\\.\\pipe\\showbiz-${id}`
        : path.join(runtime, "app.sock"),
  };
  const send = (res: ServerResponse, result: BridgeResult) => {
    if (res.writableEnded) return;
    const body = JSON.stringify(result);
    res.setHeader("content-type", "application/json");
    res.end(
      Buffer.byteLength(body) <= MAX_MESSAGE_BYTES
        ? body
        : JSON.stringify({
            ok: false,
            error: {
              code: "TOO_LARGE",
              message: "Result exceeds 1 MiB. Request a smaller page.",
            },
          }),
    );
  };
  async function serve(req: IncomingMessage, res: ServerResponse) {
    const actual = Buffer.from(req.headers.authorization ?? "");
    const expected = Buffer.from(`Bearer ${session.secret}`);
    if (
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    ) {
      res.statusCode = 401;
      send(res, {
        ok: false,
        error: { code: "UNAUTHORIZED", message: "Invalid local credentials" },
      });
      return;
    }
    if (req.method !== "POST" || req.url !== "/tools") {
      res.statusCode = 404;
      send(res, {
        ok: false,
        error: { code: "INVALID_INPUT", message: "Unknown local operation" },
      });
      return;
    }
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(String(chunk));
      bytes += buffer.length;
      if (bytes > MAX_MESSAGE_BYTES) {
        res.statusCode = 413;
        send(res, {
          ok: false,
          error: { code: "INVALID_INPUT", message: "Request exceeds 1 MiB" },
        });
        return;
      }
      chunks.push(buffer);
    }
    const input: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    send(res, await dispatch(input));
  }
  const server = createServer((req, res) => {
    void serve(req, res).catch(() =>
      send(res, {
        ok: false,
        error: { code: "INVALID_INPUT", message: "Invalid local request" },
      }),
    );
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.listen(session.socket);
  try {
    await once(server, "listening");
    await writeFile(
      path.join(directory, `${id}.json`),
      JSON.stringify(session),
      { mode: 0o600, flag: "wx" },
    );
  } catch (cause) {
    server.close();
    await rm(runtime, { recursive: true, force: true });
    throw cause;
  }
  return {
    session,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await rm(path.join(directory, `${id}.json`), { force: true });
      await rm(runtime, { recursive: true, force: true });
    },
  };
}
