import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function WorkspaceCommand({label, title, children, className = "", ...props}: ComponentProps<typeof Button> & {label:string}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" {...props} className={`workspace-command ${className}`} aria-label={label}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>{title ?? label}</TooltipContent>
    </Tooltip>
  );
}
