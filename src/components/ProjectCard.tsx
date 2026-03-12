import { Link } from "react-router";
import { Clapperboard, MoreHorizontal, Trash2 } from "lucide-react";
import {
  Card,
  CardContent,
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
import { formatProjectUpdatedAt } from "../lib/project-browser";

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
  const formattedDate = formatProjectUpdatedAt(updatedAt);

  return (
    <Card className="group overflow-hidden border-border/80 bg-card/85 transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-lg">
      <Link to={`/project/${id}`} className="block">
        <CardHeader className="border-b border-border/70 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-3 flex items-center gap-2">
                <span className="rounded-md border border-border/80 bg-secondary px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Project
                </span>
              </div>
              <h3 className="truncate text-lg font-semibold text-foreground transition-colors group-hover:text-primary">
                {name}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {formattedDate}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border/80 bg-secondary text-muted-foreground transition-colors group-hover:text-foreground">
              <Clapperboard className="h-5 w-5" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 py-4">
          <div className="rounded-lg border border-border/70 bg-background/60 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Sequence Readiness
              </span>
              <MoreHorizontal className="h-4 w-4 text-muted-foreground/70" />
            </div>
            <div className="mb-3 h-2 overflow-hidden rounded-full bg-secondary">
              <div className="h-full w-2/3 rounded-full bg-primary" />
            </div>
            <p className="text-sm text-muted-foreground">
              Open the project to manage storyboards, generate shots, and prepare an edit.
            </p>
          </div>
        </CardContent>
      </Link>
      <CardFooter className="flex items-center justify-between border-t border-border/70 pt-4">
        <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
          Desktop Project
        </div>
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
      </CardFooter>
    </Card>
  );
}
