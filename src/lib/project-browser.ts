export function formatProjectUpdatedAt(updatedAt: string): string {
  const formattedDate = new Date(updatedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return `Updated ${formattedDate}`;
}

export function getProjectBrowserSummary(projectCount: number): string {
  if (projectCount === 0) {
    return "Create a project to start building a sequence";
  }

  if (projectCount === 1) {
    return "1 project ready to edit";
  }

  return `${projectCount} projects ready to edit`;
}
