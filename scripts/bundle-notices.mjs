import { readFile } from "node:fs/promises";
import path from "node:path";

export async function collectBundleNotices(metafile, root = process.cwd()) {
const packages = new Set(
  Object.keys(metafile.inputs).flatMap((input) => {
    const resolved = path.resolve(root, input).split(path.sep).join("/");
    const match = resolved.match(/^(.*\/node_modules\/)(@[^/]+\/[^/]+|[^/]+)/);
    return match ? [path.resolve(`${match[1]}${match[2]}`)] : [];
  }),
);
const notices = [];
for (const directory of [...packages].sort()) {
  const metadata = JSON.parse(
    await readFile(path.join(directory, "package.json"), "utf8"),
  );
  let license;
  for (const filename of [
    "LICENSE",
    "LICENSE.md",
    "LICENSE.txt",
    "license",
    "license.md",
  ]) {
    try {
      license = await readFile(path.join(directory, filename), "utf8");
      break;
    } catch (cause) {
      if (cause.code !== "ENOENT") throw cause;
    }
  }
  // This published standalone release and its upstream tree omit a license file:
  // https://github.com/develar/lazy-val/tree/b69ad4119f1b19bdab13c61ee2fcc88d46b89071
  if (!license && metadata.name === "lazy-val" && metadata.version === "1.0.5" && metadata.license === "MIT") {
    license = `License declared in published package.json: MIT\nAuthor: ${metadata.author}\nRepository: develar/lazy-val\nNo standalone license text was supplied by this release or its upstream repository. This entry retains the published metadata without inventing a copyright notice.`;
  }
  if (!license)
    throw new Error(`Missing licence for bundled package ${metadata.name}`);
  notices.push(`${metadata.name} ${metadata.version}\n${license}`);
}
return notices.join("\n\n");
}
