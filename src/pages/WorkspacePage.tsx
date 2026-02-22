import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Plus, Film, Loader2 } from "lucide-react";
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

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Section Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Projects</h2>
            <p className="text-muted-foreground text-sm mt-1">
              Your AI-powered video storyboard workspace
            </p>
          </div>
          {!showNewProjectInput && (
            <Button onClick={() => setShowNewProjectInput(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Project
            </Button>
          )}
        </div>

        {/* New Project Input */}
        {showNewProjectInput && (
          <Card className="mb-6">
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
        )}

        {/* Loading State */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading projects...
          </div>
        ) : projects.length === 0 ? (
          /* Empty State */
          <Card className="border-2 border-dashed">
            <CardContent className="text-center py-16">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary mb-4">
                <Film className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">
                No projects yet
              </h3>
              <p className="text-muted-foreground mb-6">
                Create your first project to get started
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
          /* Projects Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
