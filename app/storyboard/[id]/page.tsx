"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { Plus, Download, Loader2, Sparkles, ImageIcon, Video } from "lucide-react";
import { Header } from "../../components/Header";
import ShotCard from "../../components/ShotCard";
import TabNavigation from "../../components/TabNavigation";
import TimelineEditor from "../../components/timeline/TimelineEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getStoryboard,
  updateStoryboard,
  updateStoryboardModels,
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
import { getTimelineEdits } from "../../actions/timeline-actions";
import {
  generateImageAction,
  generateVideoAction,
} from "../../actions/generation-actions";
import { videoAssembler } from "../../lib/video-assembler";
import { TimelineEdit } from "../../lib/data/timeline-edits";
import {
  ImageModelId,
  VideoModelId,
  getAvailableImageModels,
  getAvailableVideoModels,
} from "../../lib/models";

interface Storyboard {
  id: string;
  project_id: string;
  name: string;
  image_model: ImageModelId;
  video_model: VideoModelId;
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
  error_message?: string | null;
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
  error_message?: string | null;
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
    error_message: shot.error_message,
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

  // Tab State
  const [activeTab, setActiveTab] = useState<"storyboard" | "editor">("storyboard");

  // Timeline Edit State
  const [timelineEdits, setTimelineEdits] = useState<TimelineEdit[]>([]);

  // Assembly State
  const [isAssembling, setIsAssembling] = useState(false);
  const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeShotId, setActiveShotId] = useState<string | null>(null);
  const [imagePrompt, setImagePrompt] = useState("");
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  // Model Selection
  const [imageModel, setImageModel] = useState<ImageModelId>("imagen4");
  const [videoModel, setVideoModel] = useState<VideoModelId>("veo3");
  const imageModels = getAvailableImageModels();
  const videoModels = getAvailableVideoModels();

  // Load storyboard and shots on mount
  useEffect(() => {
    loadData();
  }, [id]);

  async function loadData() {
    setIsLoading(true);
    try {
      const [storyboardData, shotsData, editsData] = await Promise.all([
        getStoryboard(id),
        getShots(id),
        getTimelineEdits(id),
      ]);

      if (!storyboardData) {
        router.push("/");
        return;
      }

      setStoryboard(storyboardData);
      setShots(shotsData);
      setTimelineEdits(editsData);
      setEditedName(storyboardData.name);
      setImageModel(storyboardData.image_model || "imagen4");
      setVideoModel(storyboardData.video_model || "veo3");
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

  async function handleChangeImageModel(newModel: ImageModelId) {
    setImageModel(newModel);
    try {
      await updateStoryboardModels(id, newModel, videoModel);
    } catch (error) {
      console.error("Failed to update model selection:", error);
    }
  }

  async function handleChangeVideoModel(newModel: VideoModelId) {
    setVideoModel(newModel);
    try {
      await updateStoryboardModels(id, imageModel, newModel);
    } catch (error) {
      console.error("Failed to update model selection:", error);
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
      const imageDataUrl = await generateImageAction(imagePrompt, imageModel);

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
        imageBase64,
        videoModel
      );

      // Save to database
      const updatedShot = await saveShotVideo(shotId, videoDataUrl);
      if (updatedShot) {
        setShots((prev) =>
          prev.map((s) => (s.id === shotId ? updatedShot : s))
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Video generation failed";
      console.error(`Video generation failed for shot ${shotId}`, error);
      setShots((prev) =>
        prev.map((s) =>
          s.id === shotId ? { ...s, status: "failed" as const, error_message: errorMessage } : s
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
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center py-24">
          <div className="text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading storyboard...
          </div>
        </div>
      </div>
    );
  }

  if (!storyboard) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Main App Header */}
      <Header
        backHref={`/project/${storyboard.project_id}`}
        backLabel="Project"
        title={storyboard.name}
      >
        {/* Inline controls in header */}
        <div className="flex items-center gap-4">
          <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />

          {/* Model Selectors */}
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <ImageIcon className="h-4 w-4" />
                  {imageModels.find((m) => m.id === imageModel)?.name || "Image"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuRadioGroup
                  value={imageModel}
                  onValueChange={(v) => handleChangeImageModel(v as ImageModelId)}
                >
                  {imageModels.map((model) => (
                    <DropdownMenuRadioItem key={model.id} value={model.id}>
                      <div className="flex flex-col">
                        <span>{model.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {model.description}
                        </span>
                      </div>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Video className="h-4 w-4" />
                  {videoModels.find((m) => m.id === videoModel)?.name || "Video"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuRadioGroup
                  value={videoModel}
                  onValueChange={(v) => handleChangeVideoModel(v as VideoModelId)}
                >
                  {videoModels.map((model) => (
                    <DropdownMenuRadioItem key={model.id} value={model.id}>
                      <div className="flex flex-col">
                        <span>{model.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {model.description}
                        </span>
                      </div>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <Badge variant="secondary" className="text-sm">
            {shots.length} Shots • {totalDuration}s Total
          </Badge>
          {finalVideoUrl && (
            <Button asChild variant="outline" size="sm" className="text-primary">
              <a
                href={finalVideoUrl}
                download={`${storyboard.name.replace(/\s+/g, "_")}.mp4`}
              >
                <Download className="h-4 w-4 mr-2" />
                Download MP4
              </a>
            </Button>
          )}
        </div>
      </Header>

      {/* Main Content */}
      {activeTab === "storyboard" ? (
        <main className="flex-1 p-4 md:p-6">
          {/* Shots Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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

            {/* Add Shot Card */}
            <button
              onClick={handleAddShot}
              className="aspect-video border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors"
            >
              <Plus className="h-8 w-8 mb-2" />
              <span className="text-sm font-medium">Add Shot</span>
            </button>
          </div>
        </main>
      ) : (
        <TimelineEditor
          storyboardId={id}
          shots={shots}
          edits={timelineEdits}
          onEditsChange={setTimelineEdits}
        />
      )}


      {/* Image Generation Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Generate Image with {imageModels.find((m) => m.id === imageModel)?.name}
            </DialogTitle>
            <DialogDescription>
              Describe the scene you want to generate for this shot.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="block text-sm font-medium text-foreground mb-2">
              Image Prompt
            </label>
            <Textarea
              className="min-h-[100px]"
              placeholder="Describe the scene (e.g., 'Cyberpunk city street with neon rain')"
              value={imagePrompt}
              onChange={(e) => setImagePrompt(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleGenerateImage}
              disabled={isGeneratingImage || !imagePrompt.trim()}
            >
              {isGeneratingImage ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
