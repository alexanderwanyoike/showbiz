import { Link } from "react-router";
import { Clapperboard, Trash2, ImageIcon } from "lucide-react";
import {
  Card,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
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
    <Card className="group overflow-hidden hover:shadow-md transition-all py-0 gap-0">
      <Link to={`/storyboard/${id}`} className="block">
        {/* Preview Image Section */}
        <div className="aspect-video relative bg-muted overflow-hidden rounded-t-xl">
          {previewImageUrl ? (
            <img
              src={previewImageUrl}
              alt={`Preview of ${name}`}
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
              <ImageIcon className="h-12 w-12 mb-2 opacity-50" />
              <span className="text-sm opacity-70">No preview</span>
            </div>
          )}
          {/* Hover overlay */}
          <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/10 transition-colors" />
        </div>

        <CardHeader className="pt-4 pb-2">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                {name}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Updated {formattedDate}
              </p>
            </div>
            <div className="ml-4 p-2 rounded-lg bg-primary/10 text-primary opacity-70 group-hover:opacity-100 transition-opacity">
              <Clapperboard className="h-5 w-5" />
            </div>
          </div>
        </CardHeader>
      </Link>
      <CardFooter className="pt-0 pb-4 flex justify-end">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Storyboard</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete &quot;{name}&quot;? This will also delete all
                shots within this storyboard. This action cannot be undone.
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
      </CardFooter>
    </Card>
  );
}
