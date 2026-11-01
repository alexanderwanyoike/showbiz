import { readFile, realpath } from "node:fs/promises";
import path from "node:path";

export async function collectBundleNotices(metafile, root = process.cwd()) {
  const project = await realpath(root);
  const packages = new Set();
  for (const input of Object.keys(metafile.inputs)) {
    let directory = path.dirname(await realpath(path.resolve(root, input)));
    while (directory !== project) {
      try {
        const metadata = JSON.parse(
          await readFile(path.join(directory, "package.json"), "utf8"),
        );
        if (
          typeof metadata.name === "string" &&
          typeof metadata.version === "string"
        ) {
          packages.add(directory);
          break;
        }
      } catch (cause) {
        if (cause.code !== "ENOENT") throw cause;
      }
      const parent = path.dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
  }
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
    if (
      !license &&
      metadata.name === "lazy-val" &&
      metadata.version === "1.0.5" &&
      metadata.license === "MIT"
    ) {
      license = `License declared in published package.json: MIT\nAuthor: ${metadata.author}\nRepository: develar/lazy-val\nNo standalone license text was supplied by this release or its upstream repository. This entry retains the published metadata without inventing a copyright notice.`;
    }
    if (!license)
      throw new Error(`Missing licence for bundled package ${metadata.name}`);
    notices.push(`${metadata.name} ${metadata.version}\n${license}`);
  }
  return notices.join("\n\n");
}
