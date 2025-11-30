"use client"

import Link from "next/link"
import { Film } from "lucide-react"
import { ModeToggle } from "./mode-toggle"

interface HeaderProps {
  title?: string
  backHref?: string
  backLabel?: string
  children?: React.ReactNode
}

export function Header({ title, backHref, backLabel, children }: HeaderProps) {
  return (
    <header className="border-b border-border bg-card">
      <div className="container mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 text-primary hover:opacity-80 transition-opacity">
            <Film className="h-6 w-6" />
            <span className="font-bold text-lg">Showbiz</span>
          </Link>
          {backHref && backLabel && (
            <>
              <span className="text-muted-foreground">/</span>
              <Link href={backHref} className="text-muted-foreground hover:text-foreground transition-colors">
                {backLabel}
              </Link>
            </>
          )}
          {title && (
            <>
              <span className="text-muted-foreground">/</span>
              <span className="font-medium text-foreground truncate max-w-[200px]">{title}</span>
            </>
          )}
          {children}
        </div>
        <ModeToggle />
      </div>
    </header>
  )
}
