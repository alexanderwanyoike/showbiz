import { appendProjectDiagnostic } from "./project-diagnostics";
import type { DocumentResult } from "../shared/project-document";
import type { Result } from "../shared/result";
export function closeProjectStorage(
  closeProject: () => DocumentResult<null>,
  closeDevice: () => void,
  diagnosticPath?: string,
): Result<null> {
  const errors: string[] = [];
  try {
    const closed = closeProject();
    if (!closed.ok) errors.push(closed.error.message);
  } catch (cause) {
    errors.push(cause instanceof Error ? cause.message : String(cause));
  }
  try {
    closeDevice();
  } catch (cause) {
    errors.push(cause instanceof Error ? cause.message : String(cause));
  }
  if (errors.length && diagnosticPath) {
    const logged = appendProjectDiagnostic(diagnosticPath, errors.join("\n"));
    if (!logged.ok) errors.push(logged.error.message);
  }
  return errors.length
    ? { ok: false, error: { code: "IO_ERROR", message: errors.join("\n") } }
    : { ok: true, value: null };
}
