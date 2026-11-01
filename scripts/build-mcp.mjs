import { build } from "esbuild";
import { writeFile } from "node:fs/promises";
import { collectBundleNotices } from "./bundle-notices.mjs";
const result = await build({
  entryPoints: ["electron/mcp/stdio.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  outfile: "dist-electron/showbiz-mcp.cjs",
  metafile: true,
  legalComments: "eof",
});
await writeFile(
  "dist-electron/mcp-LICENSES.txt",
  await collectBundleNotices(result.metafile),
);
