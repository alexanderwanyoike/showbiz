export function providerErrorMessage(value: unknown, depth = 0): string | null {
  if (typeof value === "string") return value.trim().slice(0, 1000) || null;
  if (!value || typeof value !== "object" || Array.isArray(value) || depth >= 3) return null;
  const fields = value as Record<string, unknown>;
  for (const name of ["message", "error", "detail"]) {
    const message = providerErrorMessage(fields[name], depth + 1);
    if (message) return message;
  }
  return null;
}
export async function responseErrorMessage(response: { text: () => Promise<string> }): Promise<string | null> {
  try {
    const text = await response.text();
    try { const value: unknown = JSON.parse(text); return providerErrorMessage(value); }
    catch { return providerErrorMessage(text); }
  } catch { return null; }
}
