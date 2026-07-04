// Dev harness: bundle the Electron shell, start Vite, launch Electron against
// it, and tear both down together.
import { spawn, spawnSync } from "node:child_process";
import { createConnection } from "node:net";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

const build = spawnSync("yarn", ["build:electron"], { cwd: root, stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);

const vite = spawn("yarn", ["dev:frontend"], { cwd: root, stdio: "inherit" });

await waitForPort(1420, 30_000).catch((e) => {
  console.error(e.message);
  vite.kill();
  process.exit(1);
});

const electron = spawn("yarn", ["electron", "."], { cwd: root, stdio: "inherit" });

electron.on("exit", (code) => {
  vite.kill();
  process.exit(code ?? 0);
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    electron.kill();
    vite.kill();
  });
}

function waitForPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = createConnection({ port, host: "localhost" }, () => {
        socket.end();
        resolve();
      });
      socket.on("error", () => {
        socket.destroy();
        if (Date.now() > deadline) {
          reject(new Error(`Vite dev server did not open port ${port} within ${timeoutMs}ms`));
        } else {
          setTimeout(tryConnect, 250);
        }
      });
    };
    tryConnect();
  });
}
