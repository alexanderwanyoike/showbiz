"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import ProjectCard from "./components/ProjectCard";
import {
  getProjects,
  createProject,
  deleteProject,
} from "./actions/project-actions";

interface Project {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export default function WorkspacePage() {
  const router = useRouter();
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
      router.push(`/project/${project.id}`);
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold text-gray-900">Showbiz</h1>
          <p className="text-gray-500 mt-1">Your AI-powered video storyboard workspace</p>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Section Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-800">Projects</h2>
          {!showNewProjectInput && (
            <button
              onClick={() => setShowNewProjectInput(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              + New Project
            </button>
          )}
        </div>

        {/* New Project Input */}
        {showNewProjectInput && (
          <div className="mb-6 bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex gap-3">
              <input
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
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                autoFocus
              />
              <button
                onClick={handleCreateProject}
                disabled={isCreating || !newProjectName.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isCreating ? "Creating..." : "Create"}
              </button>
              <button
                onClick={() => {
                  setShowNewProjectInput(false);
                  setNewProjectName("");
                }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading ? (
          <div className="text-center py-12 text-gray-500">Loading projects...</div>
        ) : projects.length === 0 ? (
          /* Empty State */
          <div className="text-center py-16 bg-white rounded-xl border-2 border-dashed border-gray-300">
            <div className="text-5xl mb-4">🎬</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No projects yet</h3>
            <p className="text-gray-500 mb-6">Create your first project to get started</p>
            {!showNewProjectInput && (
              <button
                onClick={() => setShowNewProjectInput(true)}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                Create Project
              </button>
            )}
          </div>
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
