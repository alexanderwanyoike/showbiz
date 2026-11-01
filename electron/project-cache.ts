import fs from "node:fs";
import path from "node:path";
import type { Result } from "../shared/result";
import {
  createProcessOwner,
  parseProcessOwner,
  processOwnerStatus,
} from "./process-owner";

export function createProjectCache(directory: string) {
  return {
    sweep(): Result<null> {
      const failures: string[] = [];
      try {
        if (!fs.existsSync(directory)) return { ok: true, value: null };
        for (const entry of fs.readdirSync(directory, {
          withFileTypes: true,
        })) {
          if (!entry.isDirectory() || !entry.name.startsWith("open-")) continue;
          const folder = path.join(directory, entry.name);
          try {
          const marker = path.join(folder, ".owner.json");
          if (!fs.existsSync(marker)) continue;
          if (
            !fs.lstatSync(marker).isFile() ||
            fs.lstatSync(marker).isSymbolicLink()
          )
            continue;
          const value: unknown = JSON.parse(fs.readFileSync(marker, "utf8"));
          const owner = parseProcessOwner(value);
          if (owner && processOwnerStatus(owner) === "dead")
            fs.rmSync(folder, { recursive: true, force: true });
          } catch (cause) {
            failures.push(`${folder}: ${cause instanceof Error ? cause.message : String(cause)}`);
          }
        }
        return failures.length ? {
          ok: false,
          error: {code: "IO_ERROR", message: `Could not recover project caches: ${failures.join("\n")}`},
        } : { ok: true, value: null };
      } catch (cause) {
        return {
          ok: false,
          error: {
            code: "IO_ERROR",
            message: `Could not recover project caches at ${directory}: ${cause instanceof Error ? cause.message : String(cause)}`,
          },
        };
      }
    },
    remove(media: string): void {
      const folder = path.dirname(media);
      if (
        path.dirname(folder) !== directory ||
        !path.basename(folder).startsWith("open-") ||
        path.basename(media) !== "media"
      )
        throw new Error("Invalid project cache workspace.");
      fs.rmSync(folder, { recursive: true, force: true });
    },
    create(): string {
      fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
      const folder = fs.mkdtempSync(path.join(directory, "open-"));
      try {
        fs.writeFileSync(
          path.join(folder, ".owner.json"),
          JSON.stringify(createProcessOwner()),
          { flag: "wx", mode: 0o600 },
        );
      } catch (cause) {
        fs.rmSync(folder, { recursive: true, force: true });
        throw cause;
      }
      const media = path.join(folder, "media");
      fs.mkdirSync(media, { mode: 0o700 });
      return media;
    },
  };
}
