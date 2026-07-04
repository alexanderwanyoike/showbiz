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

export interface VersionTreeNode<T> {
  version: T;
  children: VersionTreeNode<T>[];
}

/** Flatten a version tree (as returned by the version commands) into a list. */
export function flattenVersionTree<T>(nodes: VersionTreeNode<T>[]): T[] {
  return nodes.flatMap((node) => [node.version, ...flattenVersionTree(node.children)]);
}
