import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useApplicationWork } from "../hooks/useApplicationWork";

export function ApplicationClosingDialog() {
  const { closing } = useApplicationWork();
  return (
    <Dialog open={closing}>
      <DialogContent showCloseButton={false} onEscapeKeyDown={(event) => event.preventDefault()} onInteractOutside={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Showbiz is closing</DialogTitle>
          <DialogDescription>Please wait while Showbiz finishes closing. An update may take a moment to prepare before relaunching.</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
