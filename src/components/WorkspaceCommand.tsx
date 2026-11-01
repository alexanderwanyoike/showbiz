import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function WorkspaceCommand({
  label,
  title,
  children,
  className = "",
  disabled,
  ...props
}: ComponentProps<typeof Button> & { label: string }) {
  const button = (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      {...props}
      disabled={disabled}
      className={`workspace-command ${className}`}
      aria-label={label}
      aria-hidden={disabled ? true : props["aria-hidden"]}
    >
      {children}
    </Button>
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {disabled ? (
          <span
            role="button"
            tabIndex={0}
            aria-label={label}
            aria-disabled="true"
            aria-description={title}
            aria-expanded={props["aria-expanded"]}
            aria-controls={props["aria-controls"]}
            className="workspace-command-unavailable"
          >
            {button}
          </span>
        ) : (
          button
        )}
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {title ?? label}
      </TooltipContent>
    </Tooltip>
  );
}
