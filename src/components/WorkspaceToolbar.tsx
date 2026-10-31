import "../workspace-controls.css";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
          <Tooltip><TooltipTrigger asChild><Link
            to={backHref}
            aria-label={`Back to ${backLabel ?? "projects"}`}
            className="workspace-back"
          >
            <ArrowLeft size={15} />
          </Link></TooltipTrigger><TooltipContent side="bottom" sideOffset={6}>Back to {backLabel ?? "projects"}</TooltipContent></Tooltip>
        ) : (
          <FolderOpen size={16} className="text-muted-foreground" />
        )}
        <h1 className="workspace-location-title">{title}</h1>
      </div>
      {children && <div className="workspace-toolbar-actions">{children}</div>}
    </header>
  );
}
