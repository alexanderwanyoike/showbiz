import { useId } from "react";
import { Check, ImageIcon, Maximize2, Trash2 } from "lucide-react";

export function BiblePictureTile({
  url,
  label,
  actionLabel,
  hint,
  active,
  disabled = false,
  size = "sm",
  onClick,
  onDelete,
  onExpand,
}: {
  url: string | null;
  label?: string;
  actionLabel?: string;
  hint?: string;
  active?: boolean;
  disabled?: boolean;
  size?: "sm" | "lg";
  onClick?: () => void;
  onDelete?: () => void;
  onExpand?: () => void;
}) {
  const hintId = useId();
  const dims = size === "lg" ? "h-44 w-72" : "h-20 w-28";
  return (
    <div className="bible-picture-tile relative">
      <button
        type="button"
        onClick={onClick ?? onExpand}
        disabled={disabled || (!onClick && !url)}
        aria-label={actionLabel ?? label}
        aria-describedby={hint ? hintId : undefined}
        aria-pressed={active}
        title={actionLabel ?? label}
        className={`bible-picture-select relative block ${dims} overflow-hidden rounded border bg-muted text-[10px] transition-colors ${active ? "border-primary ring-2 ring-primary" : "border-border hover:border-foreground/40"}`}
      >
        {url ? (
          <img
            src={url}
            alt={label ?? ""}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-muted-foreground/50">
            <ImageIcon className="h-5 w-5" />
          </span>
        )}
        {label && (
          <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1 py-0.5 text-[10px] text-white">
            {label}
          </span>
        )}
        {active && (
          <span className="absolute left-1 top-1 rounded-full bg-primary p-0.5 text-primary-foreground">
            <Check className="h-3 w-3" />
          </span>
        )}
      </button>
      {hint && (
        <p
          id={hintId}
          className="mt-1 max-w-28 text-[10px] text-muted-foreground"
        >
          {hint}
        </p>
      )}
      {onExpand && onClick && url && (
        <button
          type="button"
          onClick={onExpand}
          disabled={disabled}
          className="bible-picture-expand absolute bottom-1 right-1"
          aria-label={`View ${label ?? "picture"}`}
          title={`View ${label ?? "picture"}`}
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          disabled={disabled}
          className="bible-picture-delete absolute right-1 top-1"
          aria-label={`Delete ${label ?? "picture"}`}
          title={`Delete ${label ?? "picture"}`}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
