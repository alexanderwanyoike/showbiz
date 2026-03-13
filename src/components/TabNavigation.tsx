import { Film, LayoutGrid } from "lucide-react";
import { NavLink } from "react-router";
import { cn } from "@/lib/utils";
import {
  getStoryboardModePath,
  type WorkspaceMode,
} from "../lib/workstation-shell";

interface TabNavigationProps {
  storyboardId: string;
  activeMode: WorkspaceMode;
}

export default function TabNavigation({
  storyboardId,
  activeMode,
}: TabNavigationProps) {
  const tabs: { mode: WorkspaceMode; label: string; icon: typeof LayoutGrid }[] = [
    { mode: "storyboard", label: "Storyboard", icon: LayoutGrid },
    { mode: "timeline", label: "Timeline", icon: Film },
  ];

  return (
    <div className="inline-flex h-9 items-center justify-center rounded-lg bg-muted p-[3px] text-muted-foreground">
      {tabs.map(({ mode, label, icon: Icon }) => (
        <NavLink
          key={mode}
          to={getStoryboardModePath(storyboardId, mode)}
          className={cn(
            "inline-flex h-[calc(100%-1px)] items-center justify-center gap-1.5 rounded-md border border-transparent px-3 py-1 text-sm font-medium transition-[color,box-shadow]",
            activeMode === mode
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </NavLink>
      ))}
    </div>
  );
}
