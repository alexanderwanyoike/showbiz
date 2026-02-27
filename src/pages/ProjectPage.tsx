import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { Plus, Clapperboard, Loader2 } from "lucide-react";
import { Header } from "../components/Header";
import StoryboardCard from "../components/StoryboardCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
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
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Project Name Editor */}
        <div className="mb-8">
          {isEditingName ? (
            <div className="flex items-center gap-2">
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
                className="text-2xl font-bold h-auto py-1 px-2 max-w-md"
                autoFocus
              />
            </div>
          ) : (
            <h1
              className="text-2xl font-bold text-foreground cursor-pointer hover:text-primary transition-colors inline-block"
              onClick={() => setIsEditingName(true)}
              title="Click to edit"
            >
              {project.name}
            </h1>
          )}
        </div>

        {/* Section Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-foreground">Storyboards</h2>
          {!showNewStoryboardInput && (
            <Button onClick={() => setShowNewStoryboardInput(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Storyboard
            </Button>
          )}
        </div>

        {/* New Storyboard Input */}
        {showNewStoryboardInput && (
          <Card className="mb-6">
            <CardContent className="pt-4">
              <div className="flex gap-3">
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
                  autoFocus
                />
                <Button
                  onClick={handleCreateStoryboard}
                  disabled={isCreating || !newStoryboardName.trim()}
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
                    setShowNewStoryboardInput(false);
                    setNewStoryboardName("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Storyboards */}
        {storyboards.length === 0 ? (
          <Card className="border-2 border-dashed">
            <CardContent className="text-center py-16">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary mb-4">
                <Clapperboard className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">
                No storyboards yet
              </h3>
              <p className="text-muted-foreground mb-6">
                Create a storyboard to start building your video
              </p>
              {!showNewStoryboardInput && (
                <Button onClick={() => setShowNewStoryboardInput(true)} size="lg">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Storyboard
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {storyboards.map((storyboard) => (
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
      </main>
    </div>
  );
}
