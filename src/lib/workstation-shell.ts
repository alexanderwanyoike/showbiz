export type WorkspaceMode = "storyboard" | "timeline";

export function normalizeWorkspaceMode(mode: string | undefined): WorkspaceMode {
  if (mode === "timeline" || mode === "editor") {
    return "timeline";
  }

  return "storyboard";
}

export function getStoryboardModePath(
  storyboardId: string,
  mode: WorkspaceMode
): string {
  return `/storyboard/${storyboardId}/${mode}`;
}
