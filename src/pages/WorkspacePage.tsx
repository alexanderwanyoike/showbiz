import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Plus, Film, Loader2, FolderOpenDot } from "lucide-react";
import { Header } from "../components/Header";
import ProjectCard from "../components/ProjectCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  getProjects,
  createProject,
  deleteProject,
} from "../lib/tauri-api";
import type { Project } from "../lib/tauri-api";
import { getProjectBrowserSummary } from "../lib/project-browser";

export default function WorkspacePage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [showNewProjectInput, setShowNewProjectInput] = useState(false);

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    setIsLoading(true);
    try {
      const data = await getProjects();
      setProjects(data);
    } catch (error) {
      console.error("Failed to load projects:", error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreateProject() {
    if (!newProjectName.trim()) return;

    setIsCreating(true);
    try {
      const project = await createProject(newProjectName.trim());
      setProjects((prev) => [project, ...prev]);
      setNewProjectName("");
      setShowNewProjectInput(false);
      // Navigate to the new project
      navigate(`/project/${project.id}`);
    } catch (error) {
      console.error("Failed to create project:", error);
      alert("Failed to create project");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDeleteProject(id: string) {
    try {
      await deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (error) {
      console.error("Failed to delete project:", error);
      alert("Failed to delete project");
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 md:px-6">
        <section className="overflow-hidden rounded-2xl border border-border/70 bg-card/85 shadow-md">
          <div className="grid gap-6 border-b border-border/70 px-6 py-6 md:grid-cols-[1.5fr_0.9fr] md:px-8">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-secondary px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                <FolderOpenDot className="h-3.5 w-3.5" />
                Project Browser
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                  Showbiz Projects
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
                  Browse active work, open an existing project, or start a new sequence workspace.
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-border/70 bg-background/70 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Active Library
                </p>
                <p className="mt-3 text-3xl font-semibold text-foreground">
                  {projects.length}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {getProjectBrowserSummary(projects.length)}
                </p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Workflow
                </p>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  Build storyboards first, then move into sequencing and export once the cut is ready.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 px-6 py-5 md:flex-row md:items-center md:justify-between md:px-8">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Projects</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                A desktop workspace for AI-generated sequences and edits.
              </p>
            </div>
            {!showNewProjectInput && (
              <Button onClick={() => setShowNewProjectInput(true)} className="min-w-40">
                <Plus className="mr-2 h-4 w-4" />
                New Project
              </Button>
            )}
          </div>

        {showNewProjectInput && (
          <div className="px-6 pb-6 md:px-8">
            <Card className="border-border/70 bg-background/70">
              <CardContent className="pt-4">
              <div className="flex gap-3">
                <Input
                  type="text"
                  placeholder="Project name..."
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateProject();
                    if (e.key === "Escape") {
                      setShowNewProjectInput(false);
                      setNewProjectName("");
                    }
                  }}
                  autoFocus
                />
                <Button
                  onClick={handleCreateProject}
                  disabled={isCreating || !newProjectName.trim()}
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create"
                  )}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setShowNewProjectInput(false);
                    setNewProjectName("");
                  }}
                >
                  Cancel
                </Button>
              </div>
              </CardContent>
            </Card>
          </div>
        )}
        </section>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading projects...
          </div>
        ) : projects.length === 0 ? (
          <Card className="border-border/70 bg-card/85">
            <CardContent className="py-20 text-center">
              <div className="mb-5 inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-border/70 bg-secondary text-primary">
                <Film className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">
                No projects yet
              </h3>
              <p className="mx-auto mb-6 max-w-md text-muted-foreground">
                Create your first project to start building a coherent AI-driven sequence.
              </p>
              {!showNewProjectInput && (
                <Button onClick={() => setShowNewProjectInput(true)} size="lg">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Project
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                id={project.id}
                name={project.name}
                updatedAt={project.updated_at}
                onDelete={handleDeleteProject}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
