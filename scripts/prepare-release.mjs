import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, lstat, mkdir, open, readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { gunzipSync, inflateRawSync } from "node:zlib";
import { load } from "js-yaml";

function distribution(version) {
  return {
    "linux-x64": {
      metadata: "latest-linux.yml",
      installers: [`Showbiz-${version}.AppImage`, `showbiz_${version}_amd64.deb`],
      blockmaps: [],
    },
    "mac-arm64": {
      metadata: "latest-mac.yml",
      installers: [`Showbiz-${version}-arm64-mac.zip`, `Showbiz-${version}-arm64.dmg`],
      blockmaps: [`Showbiz-${version}-arm64-mac.zip.blockmap`, `Showbiz-${version}-arm64.dmg.blockmap`],
    },
    "win-x64": {
      metadata: "latest.yml",
      installers: [`Showbiz.Setup.${version}.exe`],
      blockmaps: [`Showbiz.Setup.${version}.exe.blockmap`],
    },
  };
}

function validateBlockmap(bytes, decompress, name) {
  try {
    const map = JSON.parse(decompress(bytes));
    if (map.version !== "2" || !Array.isArray(map.files) || map.files.length === 0) throw new Error("Expected a version 2 blockmap");
  } catch (error) {
    throw new Error(`Invalid blockmap: ${name}`, { cause: error });
  }
}

async function validateEmbeddedBlockmap(source, file) {
  if (!Number.isSafeInteger(file.blockMapSize) || file.blockMapSize <= 0 || file.blockMapSize >= file.size - 4) {
    throw new Error(`Invalid embedded blockmap size: ${file.url}`);
  }
  const handle = await open(path.join(source, file.url), "r");
  try {
    const footer = Buffer.alloc(4);
    await handle.read(footer, 0, 4, file.size - 4);
    if (footer.readUInt32BE() !== file.blockMapSize) throw new Error(`Invalid embedded blockmap footer: ${file.url}`);
    const bytes = Buffer.alloc(file.blockMapSize);
    await handle.read(bytes, 0, bytes.length, file.size - 4 - bytes.length);
    validateBlockmap(bytes, inflateRawSync, file.url);
  } finally {
    await handle.close();
  }
}

async function validateMetadata(source, target, version) {
  const metadata = load(await readFile(path.join(source, target.metadata), "utf8"));
  if (metadata?.version !== version) throw new Error(`Metadata version mismatch: ${target.metadata}`);
  if (!Array.isArray(metadata.files)) throw new Error(`Missing metadata assets: ${target.metadata}`);
  const seen = new Set();
  for (const file of metadata.files) {
    if (!target.installers.includes(file?.url)) throw new Error(`Unexpected metadata asset in ${target.metadata}: ${file?.url}`);
    if (seen.has(file.url)) throw new Error(`Duplicate metadata asset: ${file.url}`);
    seen.add(file.url);
    const hash = createHash("sha512");
    let size = 0;
    for await (const chunk of createReadStream(path.join(source, file.url))) {
      hash.update(chunk);
      size += chunk.length;
    }
    if (hash.digest("base64") !== file.sha512) throw new Error(`Checksum mismatch: ${file.url}`);
    if (size !== file.size) throw new Error(`Size mismatch: ${file.url}`);
    if (file.url.endsWith(".AppImage")) await validateEmbeddedBlockmap(source, file);
  }
  for (const name of target.installers) {
    if (!seen.has(name)) throw new Error(`Missing metadata asset: ${name}`);
  }
  const legacy = metadata.files.find((file) => file.url === metadata.path);
  if (!legacy || legacy.sha512 !== metadata.sha512) throw new Error(`Legacy metadata mismatch: ${target.metadata}`);
}

async function prepareRelease() {
  const { values } = parseArgs({ options: {
    tag: { type: "string" }, source: { type: "string" }, output: { type: "string" },
    platform: { type: "string" },
  } });
  if (!values.tag || !values.source || !values.output) {
    throw new Error("Usage: prepare-release.mjs --tag vX.Y.Z --source DIR --output DIR [--platform linux-x64|mac-arm64|win-x64]");
  }
  if (!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(values.tag)) {
    throw new Error(`Expected a stable tag vX.Y.Z, received: ${values.tag}`);
  }
  const version = values.tag.slice(1);
  const targets = distribution(version);
  if (values.platform && !targets[values.platform]) throw new Error(`Unsupported platform: ${values.platform}`);
  const selected = values.platform ? [targets[values.platform]] : Object.values(targets);
  const names = selected.flatMap(({ metadata, installers, blockmaps }) => [metadata, ...installers, ...blockmaps]);
  for (const name of names) {
    const file = await lstat(path.join(values.source, name)).catch((error) => {
      throw new Error(`Missing required release artifact: ${name}`, { cause: error });
    });
    if (!file.isFile() || file.size === 0) throw new Error(`Empty or invalid release artifact: ${name}`);
  }
  for (const target of selected) await validateMetadata(values.source, target, version);
  for (const name of selected.flatMap((target) => target.blockmaps)) {
    validateBlockmap(await readFile(path.join(values.source, name)), gunzipSync, name);
  }
  await mkdir(values.output);
  for (const name of names) await copyFile(path.join(values.source, name), path.join(values.output, name));
  console.log(`Validated and staged ${names.length} release artifacts for ${values.tag}`);
}

try {
  await prepareRelease();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
