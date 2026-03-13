import { useState } from "react";
import { Link } from "react-router";
import { ChevronLeft, Film, Settings } from "lucide-react";
import { ModeToggle } from "./mode-toggle"
import { SettingsDialog } from "./SettingsDialog"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface HeaderProps {
  title?: string;
  backHref?: string;
  backLabel?: string;
  children?: React.ReactNode;
}

export function Header({ title, backHref, backLabel, children }: HeaderProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur">
      <div className="flex h-11 items-center justify-between gap-3 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            to="/"
            className="flex h-8 items-center gap-2 rounded-md border border-border/70 bg-card/70 px-2.5 text-foreground transition-colors hover:bg-accent"
          >
            <Film className="h-4 w-4" />
            <span className="text-sm font-semibold tracking-tight">Showbiz</span>
          </Link>
          {backHref && backLabel && (
            <Link
              to={backHref}
              className="flex h-8 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
              {backLabel}
            </Link>
          )}
          {title && (
            <div className="min-w-0 border-l border-border/70 pl-3">
              <span className="block truncate text-sm font-medium text-foreground">
                {title}
              </span>
            </div>
          )}
          {children ? <div className="min-w-0">{children}</div> : null}
        </div>
        <div className="flex items-center gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSettingsOpen(true)}
                  className="h-8 w-8"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Settings</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <ModeToggle />
        </div>
      </div>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </header>
  )
}
