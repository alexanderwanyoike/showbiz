import { Link } from "react-router";
import { Trash2, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface StoryboardCardProps {
  id: string;
  name: string;
  updatedAt: string;
  previewImageUrl?: string | null;
  onDelete: (id: string) => void;
}

export default function StoryboardCard({
  id,
  name,
  updatedAt,
  previewImageUrl,
  onDelete,
}: StoryboardCardProps) {
  const formattedDate = new Date(updatedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="storyboard-card group">
      <Link to={`/storyboard/${id}`} className="block">
        {/* 16:9 Thumbnail */}
        <div className="storyboard-card-preview aspect-video relative overflow-hidden bg-muted/50">
          {previewImageUrl ? (
            <img
              src={previewImageUrl}
              alt={`Preview of ${name}`}
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
          <h3 className="text-sm font-medium text-foreground truncate">
            {name}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {formattedDate}
          </p>
        </div>
      </Link>

      {/* Delete button — appears on hover */}
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 bg-card text-foreground"
              aria-label={`Delete ${name}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Storyboard</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete &quot;{name}&quot;? This will
                also delete all shots within this storyboard. This action cannot
                be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => onDelete(id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
