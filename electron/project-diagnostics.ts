import fs from "node:fs";
import path from "node:path";
import type { Result } from "../shared/result";

export function appendProjectDiagnostic(
  file: string,
  message: string,
): Result<null> {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    fs.appendFileSync(file, `${new Date().toISOString()} ${message}\n`, {
      mode: 0o600,
    });
    return { ok: true, value: null };
  } catch (cause) {
    return {
      ok: false,
      error: {
        code: "IO_ERROR",
        message: `Could not write project diagnostic at ${file}: ${cause instanceof Error ? cause.message : String(cause)}`,
      },
    };
  }
}
