import { useUnsavedWork } from "../hooks/useApplicationWork";
import { useState, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { Plus, Clapperboard, Loader2, Search, Pencil } from "lucide-react";
import { WorkspaceToolbar as Header } from "../components/WorkspaceToolbar";
import StoryboardCard from "../components/StoryboardCard";
import ProjectBibleView from "../components/ProjectBibleView";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getProject,
  getStoryboardsWithPreview,
  createStoryboard,
  deleteStoryboard,
  updateProject,
} from "../lib/backend-api";
import type { Project, StoryboardWithPreview } from "../lib/backend-api";

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
  const [searchParams] = useSearchParams();
  const activeTab = searchParams.get("view") === "bible" ? "bible" : "storyboards";

  useUnsavedWork("draft", showNewStoryboardInput && !!newStoryboardName, newStoryboardName);
  useUnsavedWork("draft", isEditingName && editedName !== project?.name, editedName);

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
      <div className="desktop-page">
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
    <div className="desktop-page">
      <Header backHref="/" backLabel="Projects" title={project.name}>
        {isEditingName ? (
          <Input aria-label="Project name" value={editedName} onChange={(event) => setEditedName(event.target.value)} onBlur={handleUpdateProjectName}
            onKeyDown={(event) => {
              if (event.key === "Enter") void handleUpdateProjectName();
              if (event.key === "Escape") { setIsEditingName(false); setEditedName(project.name); }
            }} className="h-7 w-56 text-xs" autoFocus />
        ) : <Button variant="ghost" size="icon" aria-label="Rename project" title="Rename project" onClick={() => setIsEditingName(true)}><Pencil size={13} /></Button>}
      </Header>
      <main className="workspace-body">
        {activeTab === "bible" ? (
          <ProjectBibleView projectId={project.id} />
        ) : (
          <>
        {/* Top bar: search + new storyboard */}
        <div className="library-toolbar">
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
            className="storyboard-contact-sheet"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
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
          <div className="library-summary">
            {filteredStoryboards.length === storyboards.length
              ? `${storyboards.length} storyboard${storyboards.length === 1 ? "" : "s"}`
              : `${filteredStoryboards.length} of ${storyboards.length} storyboard${storyboards.length === 1 ? "" : "s"}`}
          </div>
        )}
          </>
        )}
      </main>
    </div>
  );
}
