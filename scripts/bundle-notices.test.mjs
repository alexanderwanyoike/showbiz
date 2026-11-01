import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { collectBundleNotices } from "./bundle-notices.mjs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test } from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
test("builds and packages a readable main/preload notice retaining Undici's MIT copyright and license", () => {
  execFileSync("yarn", ["build:electron"], { cwd: root, stdio: "pipe" });
  const text = readFileSync(path.join(root, "dist-electron/THIRD_PARTY_NOTICES.txt"), "utf8");
  assert.match(text, /undici 7\.30\.1/);
  assert.match(text, /Copyright.*Undici/i);
  assert.match(text, /Permission is hereby granted, free of charge/);
  assert.match(text, /lazy-val 1\.0\.5[\s\S]*License declared in published package.json: MIT[\s\S]*Author: Vladimir Krivosheev/);
  const manifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  assert.ok(manifest.build.extraResources.some((resource) => resource.from === "dist-electron/THIRD_PARTY_NOTICES.txt" && resource.to === "THIRD_PARTY_NOTICES.txt"));
});

function packageFixture(directory, name, version, license) {
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, "package.json"), JSON.stringify({ name, version }));
  writeFileSync(path.join(directory, "index.js"), "export const value = 1;");
  writeFileSync(path.join(directory, "LICENSE"), license);
}
test("retains the resolved nested dependency's exact license rather than a top-level package with the same name", async (t) => {
  const fixture = mkdtempSync(path.join(tmpdir(), "showbiz-bundle-licenses-"));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const nested = path.join(fixture, "node_modules/outer/node_modules/dependency");
  packageFixture(nested, "dependency", "1.0.0", "Copyright nested original");
  packageFixture(path.join(fixture, "node_modules/dependency"), "dependency", "2.0.0", "Copyright unrelated top-level");
  const input = path.relative(fixture, path.join(nested, "index.js")).split(path.sep).join("/");
  const text = await collectBundleNotices({ inputs: { [input]: {} } }, fixture);
  assert.match(text, /dependency 1\.0\.0\nCopyright nested original/);
  assert.doesNotMatch(text, /unrelated top-level/);
});
