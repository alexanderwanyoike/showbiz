import { build } from "esbuild";
import { writeFile } from "node:fs/promises";
import { collectBundleNotices } from "./bundle-notices.mjs";

const result = await build({
  entryPoints: ["electron/main.ts", "electron/preload.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["electron"],
  outdir: "dist-electron",
  outExtension: { ".js": ".cjs" },
  metafile: true,
  legalComments: "eof",
});
await writeFile(
  "dist-electron/THIRD_PARTY_NOTICES.txt",
  await collectBundleNotices(result.metafile),
);
