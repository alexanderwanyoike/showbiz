import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface OpenProjectShellProps {
  children: ReactNode;
  className?: string;
}

export function OpenProjectShell({
  children,
  className,
}: OpenProjectShellProps) {
  return (
    <div className={cn("flex h-[calc(100dvh-2.75rem)] min-h-0 flex-col bg-background", className)}>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}
