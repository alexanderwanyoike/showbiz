import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import assert from "node:assert/strict";
import { test } from "node:test";

test("emits every Manrope font referenced by the production entry-point styles", async (t) => {
  const previousEnvironment = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  t.after(() => {
    if (previousEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnvironment;
  });
  const root = fileURLToPath(new URL("../", import.meta.url));
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
  assert.ok(fonts.length > 0, "Production CSS must reference bundled Manrope fonts.");
  for (const [, url] of fonts) {
    const fontPath = path.posix.normalize(
      path.posix.join(path.posix.dirname(stylesheet.fileName), url),
    );
    assert.ok(assets.some((asset) => asset.fileName === fontPath), `Missing production font ${fontPath}`);
  }
});
