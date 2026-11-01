import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
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
