import { readFile } from "node:fs/promises";
import path from "node:path";

export async function collectBundleNotices(metafile, root = process.cwd()) {
const packages = new Set(
  Object.keys(metafile.inputs).flatMap((input) => {
    const parts = input
      .split("/node_modules/")
      .pop()
      .replace(/^node_modules\//, "")
      .split("/");
    return input.includes("node_modules/")
      ? [
          path.join(
            root, "node_modules",
            parts[0].startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0],
          ),
        ]
      : [];
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
  if (!license)
    throw new Error(`Missing licence for bundled package ${metadata.name}`);
  notices.push(`${metadata.name} ${metadata.version}\n${license}`);
}
return notices.join("\n\n");
}
