import { existsSync } from "node:fs";
import path from "node:path";
import { collectBundleNotices } from "./bundle-notices.mjs";

/** @returns {import('vite').Plugin} */
export function rendererNotices() {
  return {
    name: "showbiz-renderer-notices",
    apply: "build",
    async generateBundle() {
      const files = [...this.getModuleIds()]
        .filter((id) => !id.startsWith("\0"))
        .map((id) => id.split("?")[0])
        .filter((id) => path.isAbsolute(id) && existsSync(id));
      const source = await collectBundleNotices({
        inputs: Object.fromEntries(files.map((id) => [id, {}])),
      });
      this.emitFile({
        type: "asset",
        fileName: "THIRD_PARTY_NOTICES.txt",
        source,
      });
    },
  };
}
