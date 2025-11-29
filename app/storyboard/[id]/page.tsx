"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ShotCard from "../../components/ShotCard";
import {
  getStoryboard,
  updateStoryboard,
} from "../../actions/project-actions";
import {
  getShots,
  createShot,
  updateShot,
  deleteShot,
  saveShotImage,
  saveShotVideo,
  reorderShots,
  getShotImageBase64,
  copyImageFromShot,
} from "../../actions/shot-actions";
import {
  generateImageAction,
  generateVideoAction,
} from "../../actions/gemini-actions";
import { videoAssembler } from "../../lib/video-assembler";

interface Storyboard {
  id: string;
  project_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

interface Shot {
  id: string;
  storyboard_id: string;
  order: number;
  image_prompt: string | null;
  image_url: string | null;
  video_prompt: string | null;
  video_url: string | null;
  status: "pending" | "generating" | "complete" | "failed";
  created_at: string;
  updated_at: string;
}

// Map database shot to ShotCard format
interface ShotCardData {
  id: string;
  order: number;
  uploaded_image: string | null;
  gemini_prompt: string | null;
  generated_image: string | null;
  video_prompt: string;
  video_url: string | null;
  status: "pending" | "generating" | "complete" | "failed";
}

function mapShotToCardData(shot: Shot): ShotCardData {
  return {
    id: shot.id,
    order: shot.order,
    uploaded_image: null, // We use image_url for both
    gemini_prompt: shot.image_prompt,
    generated_image: shot.image_url,
    video_prompt: shot.video_prompt || "",
    video_url: shot.video_url,
    status: shot.status,
  };
}

export default function StoryboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [storyboard, setStoryboard] = useState<Storyboard | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");

  // Assembly State
  const [isAssembling, setIsAssembling] = useState(false);
  const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeShotId, setActiveShotId] = useState<string | null>(null);
  const [imagePrompt, setImagePrompt] = useState("");
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  // Load storyboard and shots on mount
  useEffect(() => {
    loadData();
  }, [id]);

  async function loadData() {
    setIsLoading(true);
    try {
      const [storyboardData, shotsData] = await Promise.all([
        getStoryboard(id),
        getShots(id),
      ]);

      if (!storyboardData) {
        router.push("/");
        return;
      }

      setStoryboard(storyboardData);
      setShots(shotsData);
      setEditedName(storyboardData.name);
    } catch (error) {
      console.error("Failed to load storyboard:", error);
      router.push("/");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleUpdateStoryboardName() {
    if (!editedName.trim() || editedName === storyboard?.name) {
      setIsEditingName(false);
      setEditedName(storyboard?.name || "");
      return;
    }

    try {
      const updated = await updateStoryboard(id, editedName.trim());
      if (updated) {
        setStoryboard(updated);
      }
      setIsEditingName(false);
    } catch (error) {
      console.error("Failed to update storyboard name:", error);
      alert("Failed to update storyboard name");
    }
  }

  // --- Shot Actions ---

  async function handleAddShot() {
    try {
      const newShot = await createShot(id);
      setShots((prev) => [...prev, newShot]);
    } catch (error) {
      console.error("Failed to create shot:", error);
      alert("Failed to create shot");
    }
  }

  async function handleUpdateShot(
    shotId: string,
    updates: Partial<ShotCardData>
  ) {
    // Optimistic update for UI responsiveness
    setShots((prev) =>
      prev.map((s) =>
        s.id === shotId
          ? {
              ...s,
              video_prompt: updates.video_prompt ?? s.video_prompt,
              status: updates.status ?? s.status,
            }
          : s
      )
    );

    // Persist to database
    try {
      await updateShot(shotId, {
        video_prompt: updates.video_prompt,
        status: updates.status,
      });
    } catch (error) {
      console.error("Failed to update shot:", error);
      // Reload to sync state
      loadData();
    }
  }

  async function handleDeleteShot(shotId: string) {
    try {
      await deleteShot(shotId);
      setShots((prev) => {
        const filtered = prev.filter((s) => s.id !== shotId);
        // Reorder remaining shots
        return filtered.map((s, idx) => ({ ...s, order: idx + 1 }));
      });
      // Reset final video since shots changed
      setFinalVideoUrl(null);
    } catch (error) {
      console.error("Failed to delete shot:", error);
      alert("Failed to delete shot");
    }
  }

  async function handleMoveShot(index: number, direction: "up" | "down") {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === shots.length - 1) return;

    const newShots = [...shots];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    [newShots[index], newShots[targetIndex]] = [
      newShots[targetIndex],
      newShots[index],
    ];

    const reordered = newShots.map((s, idx) => ({ ...s, order: idx + 1 }));
    setShots(reordered);

    // Persist reorder
    try {
      await reorderShots(id, reordered.map((s) => s.id));
    } catch (error) {
      console.error("Failed to reorder shots:", error);
      loadData();
    }
  }

  // --- Image Handlers ---

  function openImageModal(shotId: string) {
    setActiveShotId(shotId);
    setImagePrompt("");
    setIsModalOpen(true);
  }

  async function handleGenerateImage() {
    if (!activeShotId || !imagePrompt) return;

    setIsGeneratingImage(true);
    try {
      const imageDataUrl = await generateImageAction(imagePrompt);

      // Save to database and update state
      const updatedShot = await saveShotImage(
        activeShotId,
        imageDataUrl,
        imagePrompt
      );
      if (updatedShot) {
        setShots((prev) =>
          prev.map((s) => (s.id === activeShotId ? updatedShot : s))
        );
      }
      setIsModalOpen(false);
      // Reset final video since content changed
      setFinalVideoUrl(null);
    } catch (error) {
      console.error("Image generation failed", error);
      alert("Failed to generate image");
    } finally {
      setIsGeneratingImage(false);
    }
  }

  async function handleUploadImage(shotId: string, file: File) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      if (typeof e.target?.result === "string") {
        try {
          const updatedShot = await saveShotImage(
            shotId,
            e.target.result,
            "Uploaded image"
          );
          if (updatedShot) {
            setShots((prev) =>
              prev.map((s) => (s.id === shotId ? updatedShot : s))
            );
          }
          // Reset final video since content changed
          setFinalVideoUrl(null);
        } catch (error) {
          console.error("Failed to upload image:", error);
          alert("Failed to upload image");
        }
      }
    };
    reader.readAsDataURL(file);
  }

  // --- Copy Image from Another Shot ---

  async function handleCopyImageFromShot(targetShotId: string, sourceShotId: string) {
    try {
      const updatedShot = await copyImageFromShot(targetShotId, sourceShotId);
      if (updatedShot) {
        setShots((prev) =>
          prev.map((s) => (s.id === targetShotId ? updatedShot : s))
        );
      }
      // Reset final video since content changed
      setFinalVideoUrl(null);
    } catch (error) {
      console.error("Failed to copy image:", error);
      alert("Failed to copy image");
    }
  }

  // --- Video Generation (Per-Shot) ---

  async function handleGenerateVideo(shotId: string) {
    const shot = shots.find((s) => s.id === shotId);
    if (!shot) return;

    // Reset final video when regenerating
    setFinalVideoUrl(null);

    // Set this shot to generating status
    setShots((prev) =>
      prev.map((s) =>
        s.id === shotId ? { ...s, status: "generating" as const, video_url: null } : s
      )
    );

    try {
      // Get image as base64 for Veo API
      const imageBase64 = await getShotImageBase64(shotId);

      // Call Server Action
      const videoDataUrl = await generateVideoAction(
        shot.video_prompt || "",
        imageBase64
      );

      // Save to database
      const updatedShot = await saveShotVideo(shotId, videoDataUrl);
      if (updatedShot) {
        setShots((prev) =>
          prev.map((s) => (s.id === shotId ? updatedShot : s))
        );
      }
    } catch (error) {
      console.error(`Video generation failed for shot ${shotId}`, error);
      setShots((prev) =>
        prev.map((s) =>
          s.id === shotId ? { ...s, status: "failed" as const } : s
        )
      );
    }
  }

  // --- Video Assembly ---

  async function handleExport() {
    const completedShots = shots.filter(
      (s) => s.status === "complete" && s.video_url
    );

    if (completedShots.length === 0) {
      alert("No videos generated yet!");
      return;
    }

    setIsAssembling(true);
    try {
      const videoUrls = completedShots.map((s) => s.video_url!);
      const assembledUrl = await videoAssembler.assembleVideos(videoUrls);
      setFinalVideoUrl(assembledUrl);
    } catch (error) {
      console.error("Assembly failed:", error);
      alert("Failed to assemble videos. Check console for details.");
    } finally {
      setIsAssembling(false);
    }
  }

  const allShotsComplete =
    shots.length > 0 && shots.every((s) => s.status === "complete");

  const totalDuration = shots.length * 8; // Veo 3 generates 8s videos

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading storyboard...</div>
      </div>
    );
  }

  if (!storyboard) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm p-4 sticky top-0 z-10 border-b border-gray-200">
        <div className="max-w-5xl mx-auto">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <Link href="/" className="hover:text-blue-600">
              Workspace
            </Link>
            <span>/</span>
            <Link
              href={`/project/${storyboard.project_id}`}
              className="hover:text-blue-600"
            >
              Project
            </Link>
            <span>/</span>
            <span className="text-gray-900">{storyboard.name}</span>
          </div>

          <div className="flex justify-between items-center">
            {/* Storyboard Name */}
            {isEditingName ? (
              <input
                type="text"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleUpdateStoryboardName();
                  if (e.key === "Escape") {
                    setIsEditingName(false);
                    setEditedName(storyboard.name);
                  }
                }}
                onBlur={handleUpdateStoryboardName}
                className="text-xl font-bold bg-transparent border-b-2 border-blue-500 focus:outline-none"
                autoFocus
              />
            ) : (
              <h1
                className="text-xl font-bold text-gray-900 cursor-pointer hover:text-blue-600"
                onClick={() => setIsEditingName(true)}
              >
                {storyboard.name}
              </h1>
            )}

            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-500">
                {shots.length} Shots • {totalDuration}s Total
              </div>
              {finalVideoUrl && (
                <a
                  href={finalVideoUrl}
                  download={`${storyboard.name.replace(/\s+/g, "_")}.mp4`}
                  className="text-sm bg-green-100 text-green-700 px-3 py-1 rounded-full font-medium hover:bg-green-200 transition-colors"
                >
                  Download MP4
                </a>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 max-w-5xl mx-auto w-full relative">
        {/* Shots */}
        <div className="space-y-6 pb-32">
          {shots.map((shot, index) => {
            // Get other shots with images for the copy feature
            const otherShotsWithImages = shots
              .filter((s) => s.id !== shot.id && s.image_url)
              .map((s) => ({
                id: s.id,
                order: s.order,
                image_url: s.image_url!,
              }));

            return (
              <ShotCard
                key={shot.id}
                shot={mapShotToCardData(shot)}
                index={index}
                totalShots={shots.length}
                otherShotsWithImages={otherShotsWithImages}
                onUpdate={handleUpdateShot}
                onDelete={handleDeleteShot}
                onMove={handleMoveShot}
                onGenerateImage={openImageModal}
                onUploadImage={handleUploadImage}
                onCopyImageFromShot={handleCopyImageFromShot}
                onGenerateVideo={handleGenerateVideo}
              />
            );
          })}

          {/* Add Shot Button */}
          <button
            onClick={handleAddShot}
            className="w-full py-4 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 font-medium hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50 transition-all flex items-center justify-center gap-2"
          >
            <span className="text-xl">+</span> Add New Shot
          </button>
        </div>
      </main>

      {/* Footer Actions */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-20">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-4">
          <Link
            href={`/project/${storyboard.project_id}`}
            className="px-6 py-2.5 rounded-lg text-gray-600 hover:bg-gray-100 font-medium transition-colors text-center"
          >
            Back to Project
          </Link>

          <button
            onClick={handleExport}
            disabled={isAssembling || !allShotsComplete}
            className="px-6 py-2.5 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 shadow-sm shadow-green-200 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
              <h3 className="font-semibold text-lg text-gray-900">
                Generate Image with Imagen
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                X
              </button>
            </div>
            <div className="p-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Image Prompt
              </label>
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
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleGenerateImage}
                  disabled={isGeneratingImage || !imagePrompt.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
