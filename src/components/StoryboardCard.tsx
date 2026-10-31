import { useRef, useState } from "react";
import type { Result } from "../../shared/result";
import { ConfirmDeletion } from "./ConfirmDeletion";
import { Link } from "react-router";
import { MoreHorizontal, Trash2, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface StoryboardCardProps {
  id: string;
  name: string;
  updatedAt: string;
  previewImageUrl?: string | null;
  onDelete: (id: string) => Promise<Result<null>>;
}

export default function StoryboardCard({
  id,
  name,
  updatedAt,
  previewImageUrl,
  onDelete,
}: StoryboardCardProps) {
  const actions = useRef<HTMLButtonElement | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const formattedDate = new Date(updatedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <article className="storyboard-card group">
      <Link
        to={`/storyboard/${id}`}
        className="block"
        aria-label={`Open storyboard ${name}`}
      >
        {/* 16:9 Thumbnail */}
        <div className="storyboard-card-preview aspect-video relative overflow-hidden bg-muted/50">
          {previewImageUrl ? (
            <img
              src={previewImageUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/40">
              <ImageIcon className="h-10 w-10" />
            </div>
          )}
        </div>

        {/* Text below thumbnail */}
        <div className="storyboard-card-caption">
          <h2 className="text-sm font-medium text-foreground truncate">
            {name}
          </h2>
          <time dateTime={updatedAt}>{formattedDate}</time>
        </div>
      </Link>

      <div className="storyboards-card-actions">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              ref={actions}
              variant="ghost"
              size="icon"
              aria-label={`Storyboard actions for ${name}`}
              title={`Storyboard actions for ${name}`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setDeleteOpen(true)}>
              <Trash2 className="h-3.5 w-3.5" />
              Delete storyboard…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <ConfirmDeletion
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete storyboard"
        description={`Delete “${name}” and all its shots? This cannot be undone.`}
        actionLabel="Delete storyboard"
        restoreFocus={() => actions.current?.focus()}
        onConfirm={() => onDelete(id)}
      />
    </article>
  );
}
