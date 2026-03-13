import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface OpenProjectShellProps {
  title: string;
  subtitle?: string;
  toolbar?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function OpenProjectShell({
  title,
  subtitle,
  toolbar,
  children,
  className,
}: OpenProjectShellProps) {
  return (
    <div className={cn("flex min-h-screen flex-col bg-background", className)}>
      <div className="border-b border-border bg-card/80">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 md:px-6">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold text-foreground md:text-2xl">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
          {toolbar ? <div className="flex items-center gap-2">{toolbar}</div> : null}
        </div>
      </div>

      <div className="flex-1">{children}</div>
    </div>
  );
}
