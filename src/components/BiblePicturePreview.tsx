import { useRef } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export function BiblePicturePreview({
  url,
  onClose,
}: {
  url: string;
  onClose: () => void;
}) {
  const origin = useRef(
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="max-w-[95vw] border-0 bg-black/95 p-4 sm:max-w-[95vw]"
        aria-describedby={undefined}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          origin.current?.focus();
        }}
      >
        <DialogTitle className="sr-only">Picture preview</DialogTitle>
        <img
          src={url}
          alt="Bible picture"
          className="max-h-[88vh] w-full object-contain"
        />
      </DialogContent>
    </Dialog>
  );
}
