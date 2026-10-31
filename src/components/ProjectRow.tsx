import { Link } from "react-router";
import { Folder, Trash2, ChevronRight } from "lucide-react";
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

interface ProjectRowProps {
  id: string;
  name: string;
  updatedAt: string;
  onDelete: (id: string) => void;
}

export default function ProjectRow({
  id,
  name,
  updatedAt,
  onDelete,
}: ProjectRowProps) {
  const formattedDate = new Date(updatedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <tr className="project-row">
      <td>
        <Link to={`/project/${id}`} className="project-row-link">
          <Folder size={19} />
          <span>
            <strong>{name}</strong>
            <small>Showbiz project</small>
          </span>
        </Link>
      </td>
      <td className="project-row-date">{formattedDate}</td>
      <td>
        <div className="project-row-actions">
          <Link
            to={`/project/${id}`}
            aria-label={`Open ${name}`}
            title="Open project"
          >
            <ChevronRight size={15} />
          </Link>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label={`Delete ${name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Project</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete &quot;{name}&quot;? This will
                  also delete all storyboards and shots within this project.
                  This action cannot be undone.
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
      </td>
    </tr>
  );
}
