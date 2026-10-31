export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: "INVALID_INPUT" | "NOT_FOUND" | "IO_ERROR"; message: string } };
