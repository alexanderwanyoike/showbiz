import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";

// Dev-only console tap: the WebKitGTK webview has no accessible devtools in
// this environment, so the app POSTs console lines here and they land in a
// file that tooling (and agents) can tail. No-op in production builds.
function debugLogSink(): Plugin {
  const logFile = "/tmp/showbiz-console.log";
  return {
    name: "showbiz-debug-log-sink",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__debuglog", (req, res) => {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          fs.appendFileSync(logFile, body + "\n");
          res.end("ok");
        });
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), debugLogSink()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  // Vite options tailored for Tauri development
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  // Exclude ffmpeg packages from Vite dep optimization (worker import breaks otherwise)
  optimizeDeps: {
    exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/util"],
  },
  // Env variables starting with TAURI_ will be exposed
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    // Tauri uses Chromium on Windows/Linux and WebKit on macOS
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    // Don't minify for debug builds
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    // Produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    outDir: "dist",
  },
});
