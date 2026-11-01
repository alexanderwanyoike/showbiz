import { readFile, realpath } from "node:fs/promises";
import path from "node:path";

// This release and upstream omit a standalone licence text:
// https://github.com/develar/lazy-val/tree/b69ad4119f1b19bdab13c61ee2fcc88d46b89071
const upstreamLicensePackages = new Set([
  "@radix-ui/react-use-size@1.1.1",
  "@radix-ui/react-context@1.1.2",
  "@radix-ui/number@1.1.1",
  "@radix-ui/react-compose-refs@1.1.2",
  "@radix-ui/react-direction@1.1.1",
  "@radix-ui/react-use-rect@1.1.1",
  "@radix-ui/react-use-layout-effect@1.1.1",
  "@radix-ui/react-use-previous@1.1.1",
  "@radix-ui/rect@1.1.1",
  "@radix-ui/react-id@1.1.1",
  "@radix-ui/react-use-callback-ref@1.1.1",
  "@radix-ui/react-use-escape-keydown@1.1.1",
]);

const declaredLicenseOnly = new Map([
  ["lazy-val@1.0.5", { license: "MIT", repository: "develar/lazy-val" }],
  [
    "react-remove-scroll-bar@2.3.8",
    { license: "MIT", repository: "theKashey/react-remove-scroll-bar" },
  ],
]);

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
      "OFL.txt",
    ]) {
      try {
        license = await readFile(path.join(directory, filename), "utf8");
        break;
      } catch (cause) {
        if (cause.code !== "ENOENT") throw cause;
      }
    }
    if (
      !license &&
      metadata.license === "MIT" &&
      upstreamLicensePackages.has(`${metadata.name}@${metadata.version}`)
    ) {
      license = await readFile(
        new URL("./licenses/radix-ui-MIT.txt", import.meta.url),
        "utf8",
      );
    }
    const declared = declaredLicenseOnly.get(
      `${metadata.name}@${metadata.version}`,
    );
    if (!license && declared && declared.license === metadata.license) {
      license = `License declared in published package.json: ${declared.license}\nAuthor: ${metadata.author}\nRepository: ${declared.repository}\nNo standalone license text was supplied by this release. This entry retains the published metadata without inventing a copyright notice.`;
    }
    if (!license)
      throw new Error(`Missing licence for bundled package ${metadata.name}`);
    notices.push(`${metadata.name} ${metadata.version}\n${license}`);
  }
  return notices.join("\n\n");
}
