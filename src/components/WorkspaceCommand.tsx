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
      className={`workspace-command ${disabled ? "opacity-50" : ""} ${className}`}
      aria-label={label}
      aria-disabled={disabled || undefined}
      aria-description={disabled ? title : props["aria-description"]}
      onClick={(event) => {
        if (disabled) { event.preventDefault(); event.stopPropagation(); return; }
        props.onClick?.(event);
      }}
      onPointerDown={(event) => {
        if (disabled) { event.preventDefault(); return; }
        props.onPointerDown?.(event);
      }}
      onKeyDown={(event) => {
        if (disabled && ["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); return; }
        props.onKeyDown?.(event);
      }}
    >
      {children}
    </Button>
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {button}
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {title ?? label}
      </TooltipContent>
    </Tooltip>
  );
}
