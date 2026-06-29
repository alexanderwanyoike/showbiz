// Per-shot version lookups. Each shot's image/video versions are keyed by shot
// id; these helpers guarantee a shot only ever reads its OWN versions (and a
// shot with no loaded entry reads empty), so versions can never leak across
// shots when the selection changes.

export function versionsForShot<T>(byShot: Record<string, T[]>, shotId: string | null): T[] {
  return shotId ? byShot[shotId] ?? [] : [];
}

export function valueForShot<T>(byShot: Record<string, T>, shotId: string | null, fallback: T): T {
  return shotId && shotId in byShot ? byShot[shotId] : fallback;
}
