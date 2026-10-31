import type { ReactNode } from "react";
import { ArrowLeft, FolderOpen } from "lucide-react";
import { Link } from "react-router";

export function WorkspaceToolbar({
  title = "Projects",
  backHref,
  backLabel,
  children,
}: {
  title?: string;
  backHref?: string;
  backLabel?: string;
  children?: ReactNode;
}) {
  return (
    <header className="workspace-toolbar">
      <div className="workspace-location">
        {backHref ? (
          <Link
            to={backHref}
            aria-label={`Back to ${backLabel ?? "projects"}`}
            className="workspace-back"
            title={`Back to ${backLabel ?? "projects"}`}
          >
            <ArrowLeft size={15} />
          </Link>
        ) : (
          <FolderOpen size={16} className="text-muted-foreground" />
        )}
        <span className="workspace-location-title">{title}</span>
      </div>
      {children && <div className="workspace-toolbar-actions">{children}</div>}
    </header>
  );
}
