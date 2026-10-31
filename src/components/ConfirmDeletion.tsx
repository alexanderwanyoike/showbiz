import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Result } from "../../shared/result";

export function ConfirmDeletion({ open, onOpenChange, title, description, onConfirm, actionLabel = "Delete", restoreFocus }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => Promise<Result<null>>;
  actionLabel?: string;
  restoreFocus?: () => void;
}) {
  const origin = useRef<HTMLElement | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!open) setError(null); }, [open]);
  async function confirm() {
    if (working) return;
    setWorking(true);
    setError(null);
    try {
      const result = await onConfirm();
      if (result.ok) onOpenChange(false);
      else setError(result.error.message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not complete the deletion.");
    } finally { setWorking(false); }
  }
  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!working) onOpenChange(next); }}>
      <AlertDialogContent onOpenAutoFocus={() => { origin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }} onCloseAutoFocus={(event) => { event.preventDefault(); if (restoreFocus) restoreFocus(); else if (origin.current?.isConnected) origin.current.focus(); }}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={working}>Cancel</AlertDialogCancel>
          <Button disabled={working} variant="destructive" onClick={() => void confirm()}>{working ? "Deleting…" : actionLabel}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
