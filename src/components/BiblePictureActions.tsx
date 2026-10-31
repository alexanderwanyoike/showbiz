import { useState, type ReactNode } from "react";
import { Ellipsis, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function BiblePictureActions({ name, hasDraft, children }: {
  name: string;
  hasDraft: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" className="bible-more-action" aria-label={`Picture actions for ${name}`} title={hasDraft ? "Picture actions (unsaved draft)" : "Picture actions"}>
          <Ellipsis className="h-4 w-4" />
          {hasDraft && <span className="bible-draft-dot" aria-label="Unsaved draft" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" collisionPadding={12} className="bible-picture-actions" aria-label={`Picture actions for ${name}`} onInteractOutside={(event) => {
        if (event.target instanceof Element && event.target.closest('[role="dialog"], [role="alertdialog"]')) event.preventDefault();
      }}>
        <div className="bible-picture-actions-heading"><h3>{name}</h3><Button size="icon" variant="ghost" aria-label="Close picture actions" onClick={() => setOpen(false)}><X className="h-3.5 w-3.5" /></Button></div>
        {children}
      </PopoverContent>
    </Popover>
  );
}
