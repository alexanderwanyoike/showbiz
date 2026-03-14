import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Plus, Film, Loader2, Search } from "lucide-react";
import { Header } from "../components/Header";
import ProjectCard from "../components/ProjectCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [searchQuery, setSearchQuery] = useState("");

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

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Main Content */}
      <main className="px-6 py-6">
        {/* Top bar: search + new project */}
        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <div className="flex-1" />
          {showNewProjectInput ? (
            <div className="flex items-center gap-2">
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
                className="h-9 w-56"
                autoFocus
              />
              <Button
                size="sm"
                onClick={handleCreateProject}
                disabled={isCreating || !newProjectName.trim()}
              >
                {isCreating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Create"
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowNewProjectInput(false);
                  setNewProjectName("");
                }}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={() => setShowNewProjectInput(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              New Project
            </Button>
          )}
        </div>

        {/* Loading State */}
        {isLoading ? (
          <div className="text-center py-24 text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading projects...
          </div>
        ) : filteredProjects.length === 0 && projects.length === 0 ? (
          /* Empty State */
          <div className="text-center py-24">
            <Film className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
            <h3 className="text-base font-medium text-foreground mb-1">
              No projects yet
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              Create your first project to get started
            </p>
            {!showNewProjectInput && (
              <Button size="sm" onClick={() => setShowNewProjectInput(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                Create Project
              </Button>
            )}
          </div>
        ) : filteredProjects.length === 0 ? (
          /* No search results */
          <div className="text-center py-24">
            <Search className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              No projects matching &quot;{searchQuery}&quot;
            </p>
          </div>
        ) : (
          /* Projects Grid */
          <div
            className="grid gap-6"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            }}
          >
            {filteredProjects.map((project) => (
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

        {/* Bottom status bar */}
        {!isLoading && projects.length > 0 && (
          <div className="mt-8 text-xs text-muted-foreground">
            {filteredProjects.length === projects.length
              ? `${projects.length} project${projects.length === 1 ? "" : "s"}`
              : `${filteredProjects.length} of ${projects.length} project${projects.length === 1 ? "" : "s"}`}
          </div>
        )}
      </main>
    </div>
  );
}
