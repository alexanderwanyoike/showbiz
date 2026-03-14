import { Link } from "react-router";
import { Film, Trash2 } from "lucide-react";
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

interface ProjectCardProps {
  id: string;
  name: string;
  updatedAt: string;
  onDelete: (id: string) => void;
}

export default function ProjectCard({
  id,
  name,
  updatedAt,
  onDelete,
}: ProjectCardProps) {
  const formattedDate = new Date(updatedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="group relative">
      <Link to={`/project/${id}`} className="block">
        {/* 16:9 Thumbnail */}
        <div className="aspect-video relative rounded-md overflow-hidden bg-muted/50 group-hover:brightness-125 transition-all duration-200">
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/40">
            <Film className="h-10 w-10" />
          </div>
        </div>

        {/* Text below thumbnail */}
        <div className="mt-2 px-0.5">
          <h3 className="text-sm font-medium text-foreground truncate">
            {name}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Last modified: {formattedDate}
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
              className="h-7 w-7 bg-black/60 hover:bg-black/80 text-white hover:text-white rounded-sm"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Project</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete &quot;{name}&quot;? This will also delete all
                storyboards and shots within this project. This action cannot be
                undone.
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
