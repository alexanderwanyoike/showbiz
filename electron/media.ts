import path from "node:path";

/**
 * Resolve a renderer-supplied relative media path against the media base
 * directory, refusing anything that escapes it (the renderer is untrusted
 * input to the main process).
 */
export function resolveMediaPath(baseDir: string, relativePath: string): string {
  if (path.isAbsolute(relativePath)) {
    throw new Error(`Media path must be relative, got absolute: ${relativePath}`);
  }
  const base = path.resolve(baseDir);
  const resolved = path.resolve(base, relativePath);
  if (!resolved.startsWith(base + path.sep)) {
    throw new Error(`Media path escapes the media directory: ${relativePath}`);
  }
  return resolved;
}
