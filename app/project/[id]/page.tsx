"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import StoryboardCard from "../../components/StoryboardCard";
import {
  getProject,
  getStoryboards,
  createStoryboard,
  deleteStoryboard,
  updateProject,
} from "../../actions/project-actions";

interface Project {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

interface Storyboard {
  id: string;
  project_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export default function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [project, setProject] = useState<Project | null>(null);
  const [storyboards, setStoryboards] = useState<Storyboard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newStoryboardName, setNewStoryboardName] = useState("");
  const [showNewStoryboardInput, setShowNewStoryboardInput] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");

  // Load project and storyboards on mount
  useEffect(() => {
    loadData();
  }, [id]);

  async function loadData() {
    setIsLoading(true);
    try {
      const [projectData, storyboardsData] = await Promise.all([
        getProject(id),
        getStoryboards(id),
      ]);

      if (!projectData) {
        router.push("/");
        return;
      }

      setProject(projectData);
      setStoryboards(storyboardsData);
      setEditedName(projectData.name);
    } catch (error) {
      console.error("Failed to load project:", error);
      router.push("/");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreateStoryboard() {
    if (!newStoryboardName.trim()) return;

    setIsCreating(true);
    try {
      const storyboard = await createStoryboard(id, newStoryboardName.trim());
      setStoryboards((prev) => [storyboard, ...prev]);
      setNewStoryboardName("");
      setShowNewStoryboardInput(false);
      // Navigate to the new storyboard
      router.push(`/storyboard/${storyboard.id}`);
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
    if (!editedName.trim() || editedName === project?.name) {
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading project...</div>
      </div>
    );
  }

  if (!project) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-6">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <Link href="/" className="hover:text-blue-600">
              Workspace
            </Link>
            <span>/</span>
            <span className="text-gray-900">{project.name}</span>
          </div>

          {/* Project Name */}
          {isEditingName ? (
            <div className="flex items-center gap-2">
              <input
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
                className="text-2xl font-bold bg-transparent border-b-2 border-blue-500 focus:outline-none"
                autoFocus
              />
            </div>
          ) : (
            <h1
              className="text-2xl font-bold text-gray-900 cursor-pointer hover:text-blue-600"
              onClick={() => setIsEditingName(true)}
            >
              {project.name}
            </h1>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Section Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-800">Storyboards</h2>
          {!showNewStoryboardInput && (
            <button
              onClick={() => setShowNewStoryboardInput(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              + New Storyboard
            </button>
          )}
        </div>

        {/* New Storyboard Input */}
        {showNewStoryboardInput && (
          <div className="mb-6 bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex gap-3">
              <input
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
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                autoFocus
              />
              <button
                onClick={handleCreateStoryboard}
                disabled={isCreating || !newStoryboardName.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isCreating ? "Creating..." : "Create"}
              </button>
              <button
                onClick={() => {
                  setShowNewStoryboardInput(false);
                  setNewStoryboardName("");
                }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Storyboards */}
        {storyboards.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border-2 border-dashed border-gray-300">
            <div className="text-5xl mb-4">🎞️</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No storyboards yet
            </h3>
            <p className="text-gray-500 mb-6">
              Create a storyboard to start building your video
            </p>
            {!showNewStoryboardInput && (
              <button
                onClick={() => setShowNewStoryboardInput(true)}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                Create Storyboard
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {storyboards.map((storyboard) => (
              <StoryboardCard
                key={storyboard.id}
                id={storyboard.id}
                name={storyboard.name}
                updatedAt={storyboard.updated_at}
                onDelete={handleDeleteStoryboard}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
