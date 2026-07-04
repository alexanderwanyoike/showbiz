import { useState } from "react"
import { Link } from "react-router"
import { Film, Settings } from "lucide-react"
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
  title?: string
  backHref?: string
  backLabel?: string
  children?: React.ReactNode
}

export function Header({ title, backHref, backLabel, children }: HeaderProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <header className="border-b border-border bg-card">
      <div className="px-3 h-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-1.5 text-primary hover:opacity-80 transition-opacity">
            <Film className="h-5 w-5" />
            <span className="font-bold text-sm">Showbiz</span>
          </Link>
          {backHref && backLabel && (
            <>
              <span className="text-muted-foreground text-xs">/</span>
              <Link to={backHref} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                {backLabel}
              </Link>
            </>
          )}
          {title && (
            <>
              <span className="text-muted-foreground text-xs">/</span>
              <span className="text-sm font-medium text-foreground truncate max-w-[200px]">{title}</span>
            </>
          )}
          {children}
        </div>
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSettingsOpen(true)}
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
