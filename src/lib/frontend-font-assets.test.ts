import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllEnvs());

it("emits every Manrope font referenced by the production entry-point styles", async () => {
  vi.stubEnv("NODE_ENV", "production");
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const result = await build({
    root,
    configFile: path.join(root, "vite.config.ts"),
    logLevel: "silent",
    build: { write: false, assetsInlineLimit: 0 },
  });
  if (Array.isArray(result) || !("output" in result))
    throw new Error("Expected one production stylesheet bundle.");
  const assets = result.output.filter((output) => output.type === "asset");
  const stylesheet = assets.find((asset) => asset.fileName.endsWith(".css"));
  if (!stylesheet || typeof stylesheet.source !== "string")
    throw new Error("Expected emitted application CSS.");
  const fonts = [
    ...stylesheet.source.matchAll(
      /url\(["']?([^\s)"']*manrope[^\s)"']*\.woff2)["']?\)/g,
    ),
  ];
  expect(fonts).toHaveLength(6);
  for (const [, url] of fonts) {
    const fontPath = path.posix.normalize(
      path.posix.join(path.posix.dirname(stylesheet.fileName), url),
    );
    expect(
      assets.map((asset) => asset.fileName),
      `Missing production font ${fontPath}`,
    ).toContain(fontPath);
  }
}, 15_000);
