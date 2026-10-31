import path from "node:path";

export function desktopAppIconPath(
  applicationPath: string,
  packaged: boolean,
): string {
  return path.join(applicationPath, packaged ? "dist" : "public", "icon.png");
}
