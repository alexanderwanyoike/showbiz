"use client";
import { useState } from "react";
import ShotCard, { Shot } from "./components/ShotCard";
import { generateImageAction, generateVideoAction } from "./actions/gemini-actions";
import { videoAssembler } from "./lib/video-assembler";

// --- Types ---

interface Project {
  id: string;
  name: string;
  storyboard: {
    shots: Shot[];
  };
}

// --- Initial Data ---

const initialProject: Project = {
  id: "proj1",
  name: "My First Showbiz Project",
  storyboard: {
    shots: [
      {
        id: "shot1",
        order: 1,
        duration: 8,
        uploaded_image: null,
        gemini_prompt: null,
        generated_image: null,
        video_prompt: "A serene forest with a flowing river at sunrise.",
        video_url: null,
        status: "pending",
      },
    ],
  },
};

export default function Home() {
  const [project, setProject] = useState<Project>(initialProject);

  // Assembly State
  const [isAssembling, setIsAssembling] = useState(false);
  const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeShotId, setActiveShotId] = useState<string | null>(null);
  const [imagePrompt, setImagePrompt] = useState("");
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  // --- Actions ---

  const addShot = () => {
    const newShot: Shot = {
      id: `shot-${Date.now()}`,
      order: project.storyboard.shots.length + 1,
      duration: 8,
      uploaded_image: null,
      gemini_prompt: null,
      generated_image: null,
      video_prompt: "",
      video_url: null,
      status: "pending",
    };

    setProject((prev) => ({
      ...prev,
      storyboard: {
        shots: [...prev.storyboard.shots, newShot],
      },
    }));
  };

  const updateShot = (id: string, updates: Partial<Shot>) => {
    setProject((prev) => ({
      ...prev,
      storyboard: {
        shots: prev.storyboard.shots.map((s) =>
          s.id === id ? { ...s, ...updates } : s
        ),
      },
    }));
  };

  const deleteShot = (id: string) => {
    setProject((prev) => {
      const filtered = prev.storyboard.shots.filter((s) => s.id !== id);
      const reordered = filtered.map((s, idx) => ({ ...s, order: idx + 1 }));
      return {
        ...prev,
        storyboard: { shots: reordered },
      };
    });
  };

  const moveShot = (index: number, direction: "up" | "down") => {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === project.storyboard.shots.length - 1) return;

    const newShots = [...project.storyboard.shots];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    [newShots[index], newShots[targetIndex]] = [newShots[targetIndex], newShots[index]];
    
    const reordered = newShots.map((s, idx) => ({ ...s, order: idx + 1 }));
    setProject((prev) => ({
      ...prev,
      storyboard: { shots: reordered },
    }));
  };

  // --- Image Handlers ---

  const openImageModal = (shotId: string) => {
    setActiveShotId(shotId);
    setImagePrompt("");
    setIsModalOpen(true);
  };

  const handleGenerateImage = async () => {
    if (!activeShotId || !imagePrompt) return;
    
    setIsGeneratingImage(true);
    try {
      const imageUrl = await generateImageAction(imagePrompt);
      updateShot(activeShotId, { 
        generated_image: imageUrl, 
        uploaded_image: null, 
        gemini_prompt: imagePrompt 
      });
      setIsModalOpen(false);
    } catch (error) {
      console.error("Image generation failed", error);
      alert("Failed to generate image");
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleUploadImage = (id: string, file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (typeof e.target?.result === 'string') {
        updateShot(id, { uploaded_image: e.target.result, generated_image: null });
      }
    };
    reader.readAsDataURL(file);
  };

  // --- Video Generation (Per-Shot) ---

  const handleGenerateVideo = async (shotId: string) => {
    const shot = project.storyboard.shots.find(s => s.id === shotId);
    if (!shot) return;

    // Reset final video when regenerating
    setFinalVideoUrl(null);

    // Set this shot to generating status
    updateShot(shotId, { status: "generating", video_url: null });

    try {
      // Get image source (uploaded or generated)
      const imageSource = shot.uploaded_image || shot.generated_image;

      // Call Server Action - Veo supports text-only if no image
      const videoUrl = await generateVideoAction(shot.video_prompt, imageSource, shot.duration);
      updateShot(shotId, { video_url: videoUrl, status: "complete" });
    } catch (error) {
      console.error(`Video generation failed for shot ${shotId}`, error);
      updateShot(shotId, { status: "failed" });
    }
  };

  // --- Video Assembly ---

  const handleExport = async () => {
    const completedShots = project.storyboard.shots.filter(s => s.status === "complete" && s.video_url);
    
    if (completedShots.length === 0) {
      alert("No videos generated yet!");
      return;
    }

    setIsAssembling(true);
    try {
      const videoUrls = completedShots.map(s => s.video_url!);
      const assembledUrl = await videoAssembler.assembleVideos(videoUrls);
      setFinalVideoUrl(assembledUrl);
    } catch (error) {
      console.error("Assembly failed:", error);
      alert("Failed to assemble videos. Check console for details.");
    } finally {
      setIsAssembling(false);
    }
  };

  const allShotsComplete = project.storyboard.shots.length > 0 && 
    project.storyboard.shots.every(s => s.status === "complete");

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      {/* Header */}
      <header className="bg-white shadow-sm p-4 sticky top-0 z-10 border-b border-gray-200">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Showbiz 🎬</h1>
          <div className="flex items-center gap-4">
            <div className="text-sm text-gray-500">
              {project.storyboard.shots.length} Shots • {project.storyboard.shots.reduce((acc, s) => acc + s.duration, 0)}s Total
            </div>
            {finalVideoUrl && (
              <a 
                href={finalVideoUrl} 
                download={`${project.name.replace(/\s+/g, '_')}.mp4`}
                className="text-sm bg-green-100 text-green-700 px-3 py-1 rounded-full font-medium hover:bg-green-200 transition-colors"
              >
                ↓ Download MP4
              </a>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 max-w-5xl mx-auto w-full relative">
        
        {/* Project Title */}
        <div className="mb-8">
          <label className="block text-sm font-medium text-gray-700 mb-1">Project Name</label>
          <input
            type="text"
            value={project.name}
            onChange={(e) => setProject({ ...project, name: e.target.value })}
            className="text-3xl font-bold bg-transparent border-b-2 border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none w-full text-gray-900 py-2 transition-colors"
          />
        </div>

        {/* Storyboard */}
        <div className="space-y-6 pb-32">
          {project.storyboard.shots.map((shot, index) => (
            <ShotCard
              key={shot.id}
              shot={shot}
              index={index}
              totalShots={project.storyboard.shots.length}
              onUpdate={updateShot}
              onDelete={deleteShot}
              onMove={moveShot}
              onGenerateImage={openImageModal}
              onUploadImage={handleUploadImage}
              onGenerateVideo={handleGenerateVideo}
            />
          ))}

          {/* Add Shot Button */}
          <button
            onClick={addShot}
            className="w-full py-4 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 font-medium hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50 transition-all flex items-center justify-center gap-2"
          >
            <span className="text-xl">+</span> Add New Shot
          </button>
        </div>
      </main>

      {/* Footer Actions */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-20">
         <div className="max-w-5xl mx-auto flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-4">
            <button className="px-6 py-2.5 rounded-lg text-gray-600 hover:bg-gray-100 font-medium transition-colors">
              Save Project
            </button>

            <button
              onClick={handleExport}
              disabled={isAssembling || !allShotsComplete}
              className="px-6 py-2.5 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 shadow-sm shadow-green-200 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAssembling ? "Assembling..." : "Export Full Movie"}
            </button>
         </div>
      </div>

      {/* Image Generation Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h3 className="font-semibold text-lg text-gray-900">Generate Image with Gemini</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="p-6">
               <label className="block text-sm font-medium text-gray-700 mb-2">Image Prompt</label>
               <textarea
                 className="w-full border border-gray-300 rounded-lg p-3 text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none mb-4"
                 rows={4}
                 placeholder="Describe the scene (e.g., 'Cyberpunk city street with neon rain')"
                 value={imagePrompt}
                 onChange={(e) => setImagePrompt(e.target.value)}
                 autoFocus
               />
               <div className="flex justify-end space-x-3">
                 <button 
                   onClick={() => setIsModalOpen(false)}
                   className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium"
                 >
                   Cancel
                 </button>
                 <button 
                   onClick={handleGenerateImage}
                   disabled={isGeneratingImage || !imagePrompt.trim()}
                   className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                 >
                   {isGeneratingImage ? "Generating..." : "Generate"}
                 </button>
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}