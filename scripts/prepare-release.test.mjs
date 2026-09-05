import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { deflateRawSync, gzipSync } from "node:zlib";
import { dump, load } from "js-yaml";

const script = fileURLToPath(new URL("./prepare-release.mjs", import.meta.url));
const installers = {
  "latest-linux.yml": ["Showbiz-1.2.3.AppImage", "showbiz_1.2.3_amd64.deb"],
  "latest-mac.yml": ["Showbiz-1.2.3-arm64-mac.zip", "Showbiz-1.2.3-arm64.dmg"],
  "latest.yml": ["Showbiz.Setup.1.2.3.exe"],
};
const blockmaps = [
  "Showbiz-1.2.3-arm64-mac.zip.blockmap",
  "Showbiz-1.2.3-arm64.dmg.blockmap",
  "Showbiz.Setup.1.2.3.exe.blockmap",
];

function fixture(t) {
  const source = mkdtempSync(path.join(tmpdir(), "showbiz-release-test-"));
  const output = path.join(source, "staged");
  t.after(() => rmSync(source, { recursive: true, force: true }));
  for (const [metadata, names] of Object.entries(installers)) {
    const files = names.map((url) => {
      let contents = Buffer.from(`Installer: ${url}`);
      const map = JSON.stringify({ version: "2", files: [{ name: "file", offset: 0, sizes: [contents.length], checksums: ["checksum"] }] });
      let blockMapSize;
      if (url.endsWith(".AppImage")) {
        const compressed = deflateRawSync(map);
        blockMapSize = compressed.length;
        const footer = Buffer.alloc(4);
        footer.writeUInt32BE(blockMapSize);
        contents = Buffer.concat([contents, compressed, footer]);
      } else if (!url.endsWith(".deb")) {
        writeFileSync(path.join(source, `${url}.blockmap`), gzipSync(map));
      }
      writeFileSync(path.join(source, url), contents);
      return { url, sha512: createHash("sha512").update(contents).digest("base64"), size: contents.length, blockMapSize };
    });
    writeFileSync(path.join(source, metadata), dump({
      version: "1.2.3", files, path: files[0].url, sha512: files[0].sha512,
    }));
  }
  const run = (...args) => execFileSync(process.execPath, [
    script, "--tag", "v1.2.3", "--source", source, "--output", output, ...args,
  ], { encoding: "utf8", stdio: "pipe" });
  return { source, output, run };
}

test("stages the complete release set with the existing website download names", (t) => {
  const { source, output, run } = fixture(t);
  writeFileSync(path.join(source, "builder-debug.yml"), "internal build diagnostic");
  run();
  const expected = [...Object.keys(installers), ...Object.values(installers).flat(), ...blockmaps].sort();
  assert.deepEqual(readdirSync(output).sort(), expected);
  for (const name of expected) {
    assert.deepEqual(readFileSync(path.join(output, name)), readFileSync(path.join(source, name)));
  }
});

for (const name of [...Object.keys(installers), ...Object.values(installers).flat(), ...blockmaps]) {
  test(`rejects a release missing ${name} before staging anything`, (t) => {
    const { source, output, run } = fixture(t);
    rmSync(path.join(source, name));
    assert.throws(run, { message: new RegExp(`Missing required release artifact: ${name.replaceAll(".", "\\.")}`) });
    assert.equal(existsSync(output), false);
  });
}

for (const [platform, metadata] of [
  ["linux-x64", "latest-linux.yml"], ["mac-arm64", "latest-mac.yml"], ["win-x64", "latest.yml"],
]) {
  test(`validates and stages ${platform} without requiring other platforms`, (t) => {
    const { source, output, run } = fixture(t);
    const expected = [metadata, ...installers[metadata], ...blockmaps.filter((name) => installers[metadata].some((file) => name === `${file}.blockmap`))].sort();
    for (const name of readdirSync(source)) if (!expected.includes(name)) rmSync(path.join(source, name));
    run("--platform", platform);
    assert.deepEqual(readdirSync(output).sort(), expected);
  });
}

function changeMetadata(source, name, change) {
  const file = path.join(source, name);
  const metadata = load(readFileSync(file, "utf8"));
  change(metadata);
  writeFileSync(file, dump(metadata));
}

for (const metadataName of Object.keys(installers)) {
  test(`rejects a mismatched version in ${metadataName}`, (t) => {
    const { source, output, run } = fixture(t);
    changeMetadata(source, metadataName, (metadata) => { metadata.version = "1.2.2"; });
    assert.throws(run, /Metadata version mismatch/);
    assert.equal(existsSync(output), false);
  });
}

for (const url of [
  "https://example.com/Showbiz.Setup.1.2.3.exe", "../Showbiz.Setup.1.2.3.exe",
  "Showbiz.Setup.1.2.2.exe", "Showbiz%20Setup%201.2.3.exe",
]) {
  test(`rejects an unexpected metadata asset reference: ${url}`, (t) => {
    const { source, run } = fixture(t);
    changeMetadata(source, "latest.yml", (metadata) => { metadata.files[0].url = url; });
    assert.throws(run, /Unexpected metadata asset/);
  });
}

test("rejects metadata that omits the macOS updater ZIP even when the ZIP exists", (t) => {
  const { source, run } = fixture(t);
  changeMetadata(source, "latest-mac.yml", (metadata) => { metadata.files.shift(); });
  assert.throws(run, /Missing metadata asset/);
});

test("rejects duplicate metadata entries", (t) => {
  const { source, run } = fixture(t);
  changeMetadata(source, "latest.yml", (metadata) => { metadata.files.push(metadata.files[0]); });
  assert.throws(run, /Duplicate metadata asset/);
});

for (const [label, change, error] of [
  ["checksum", (metadata) => { metadata.files[0].sha512 = "wrong"; }, /Checksum mismatch/],
  ["size", (metadata) => { metadata.files[0].size += 1; }, /Size mismatch/],
  ["missing size", (metadata) => { delete metadata.files[0].size; }, /Size mismatch/],
  ["legacy path", (metadata) => { metadata.path = "different.exe"; }, /Legacy metadata mismatch/],
  ["legacy checksum", (metadata) => { metadata.sha512 = "wrong"; }, /Legacy metadata mismatch/],
]) {
  test(`rejects incorrect ${label}`, (t) => {
    const { source, run } = fixture(t);
    changeMetadata(source, "latest.yml", change);
    assert.throws(run, error);
  });
}

test("rejects an installer whose bytes no longer match its metadata", (t) => {
  const { source, run } = fixture(t);
  writeFileSync(path.join(source, "Showbiz.Setup.1.2.3.exe"), "corrupt");
  assert.throws(run, /Checksum mismatch/);
});

for (const tag of ["v1.2.3-beta.1", "v1.2.3+build", "v01.2.3", "1.2.3", "v1.2", "v../../escape"]) {
  test(`rejects a non-stable tag: ${tag}`, (t) => {
    const { run } = fixture(t);
    assert.throws(() => run("--tag", tag), /Expected a stable tag/);
  });
}

test("rejects AppImage metadata without an embedded blockmap size", (t) => {
  const { source, run } = fixture(t);
  changeMetadata(source, "latest-linux.yml", (metadata) => { delete metadata.files[0].blockMapSize; });
  assert.throws(run, /Invalid embedded blockmap/);
});

test("rejects an AppImage blockmap size that differs from its footer", (t) => {
  const { source, run } = fixture(t);
  changeMetadata(source, "latest-linux.yml", (metadata) => { metadata.files[0].blockMapSize += 1; });
  assert.throws(run, /Invalid embedded blockmap/);
});

test("rejects an unreadable companion blockmap", (t) => {
  const { source, run } = fixture(t);
  writeFileSync(path.join(source, blockmaps[0]), "corrupt blockmap");
  assert.throws(run, /Invalid blockmap/);
});
