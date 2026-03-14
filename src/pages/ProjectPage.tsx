import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { Plus, Clapperboard, Loader2, Search } from "lucide-react";
import { Header } from "../components/Header";
import StoryboardCard from "../components/StoryboardCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getProject,
  getStoryboardsWithPreview,
  createStoryboard,
  deleteStoryboard,
  updateProject,
} from "../lib/tauri-api";
import type { Project, StoryboardWithPreview } from "../lib/tauri-api";

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [storyboards, setStoryboards] = useState<StoryboardWithPreview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newStoryboardName, setNewStoryboardName] = useState("");
  const [showNewStoryboardInput, setShowNewStoryboardInput] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Load project and storyboards on mount
  useEffect(() => {
    if (id) loadData();
  }, [id]);

  async function loadData() {
    if (!id) return;
    setIsLoading(true);
    try {
      const [projectData, storyboardsData] = await Promise.all([
        getProject(id),
        getStoryboardsWithPreview(id),
      ]);

      if (!projectData) {
        navigate("/");
        return;
      }

      setProject(projectData);
      setStoryboards(storyboardsData);
      setEditedName(projectData.name);
    } catch (error) {
      console.error("Failed to load project:", error);
      navigate("/");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreateStoryboard() {
    if (!id || !newStoryboardName.trim()) return;

    setIsCreating(true);
    try {
      const storyboard = await createStoryboard(id, newStoryboardName.trim());
      setStoryboards((prev) => [{ ...storyboard, preview_image_path: null }, ...prev]);
      setNewStoryboardName("");
      setShowNewStoryboardInput(false);
      // Navigate to the new storyboard
      navigate(`/storyboard/${storyboard.id}`);
    } catch (error) {
      console.error("Failed to create storyboard:", error);
      alert("Failed to create storyboard");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDeleteStoryboard(storyboardId: string) {
    try {
      await deleteStoryboard(storyboardId);
      setStoryboards((prev) => prev.filter((s) => s.id !== storyboardId));
    } catch (error) {
      console.error("Failed to delete storyboard:", error);
      alert("Failed to delete storyboard");
    }
  }

  async function handleUpdateProjectName() {
    if (!id || !editedName.trim() || editedName === project?.name) {
      setIsEditingName(false);
      setEditedName(project?.name || "");
      return;
    }

    try {
      const updated = await updateProject(id, editedName.trim());
      if (updated) {
        setProject(updated);
      }
      setIsEditingName(false);
    } catch (error) {
      console.error("Failed to update project name:", error);
      alert("Failed to update project name");
    }
  }

  const filteredStoryboards = storyboards.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center py-24">
          <div className="text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading project...
          </div>
        </div>
      </div>
    );
  }

  if (!project) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header backHref="/" backLabel="Projects" title={project.name} />

      {/* Main Content */}
      <main className="px-6 py-6">
        {/* Project Name Editor */}
        <div className="mb-4">
          {isEditingName ? (
            <Input
              type="text"
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleUpdateProjectName();
                if (e.key === "Escape") {
                  setIsEditingName(false);
                  setEditedName(project.name);
                }
              }}
              onBlur={handleUpdateProjectName}
              className="text-xl font-bold h-auto py-1 px-2 max-w-md"
              autoFocus
            />
          ) : (
            <h1
              className="text-xl font-bold text-foreground cursor-pointer hover:text-primary transition-colors inline-block"
              onClick={() => setIsEditingName(true)}
              title="Click to edit"
            >
              {project.name}
            </h1>
          )}
        </div>

        {/* Top bar: search + new storyboard */}
        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search storyboards..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <div className="flex-1" />
          {showNewStoryboardInput ? (
            <div className="flex items-center gap-2">
              <Input
                type="text"
                placeholder="Storyboard name..."
                value={newStoryboardName}
                onChange={(e) => setNewStoryboardName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateStoryboard();
                  if (e.key === "Escape") {
                    setShowNewStoryboardInput(false);
                    setNewStoryboardName("");
                  }
                }}
                className="h-9 w-56"
                autoFocus
              />
              <Button
                size="sm"
                onClick={handleCreateStoryboard}
                disabled={isCreating || !newStoryboardName.trim()}
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
                  setShowNewStoryboardInput(false);
                  setNewStoryboardName("");
                }}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={() => setShowNewStoryboardInput(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              New Storyboard
            </Button>
          )}
        </div>

        {/* Storyboards */}
        {filteredStoryboards.length === 0 && storyboards.length === 0 ? (
          <div className="text-center py-24">
            <Clapperboard className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
            <h3 className="text-base font-medium text-foreground mb-1">
              No storyboards yet
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              Create a storyboard to start building your video
            </p>
            {!showNewStoryboardInput && (
              <Button size="sm" onClick={() => setShowNewStoryboardInput(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                Create Storyboard
              </Button>
            )}
          </div>
        ) : filteredStoryboards.length === 0 ? (
          <div className="text-center py-24">
            <Search className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              No storyboards matching &quot;{searchQuery}&quot;
            </p>
          </div>
        ) : (
          <div
            className="grid gap-6"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            }}
          >
            {filteredStoryboards.map((storyboard) => (
              <StoryboardCard
                key={storyboard.id}
                id={storyboard.id}
                name={storyboard.name}
                updatedAt={storyboard.updated_at}
                previewImageUrl={storyboard.preview_image_path}
                onDelete={handleDeleteStoryboard}
              />
            ))}
          </div>
        )}

        {/* Bottom status bar */}
        {!isLoading && storyboards.length > 0 && (
          <div className="mt-8 text-xs text-muted-foreground">
            {filteredStoryboards.length === storyboards.length
              ? `${storyboards.length} storyboard${storyboards.length === 1 ? "" : "s"}`
              : `${filteredStoryboards.length} of ${storyboards.length} storyboard${storyboards.length === 1 ? "" : "s"}`}
          </div>
        )}
      </main>
    </div>
  );
}
