import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router";
import { Plus, Loader2, Sparkles, ImageIcon, Video, SlidersHorizontal, Save } from "lucide-react";
import { Header } from "../components/Header";
import ShotCard from "../components/ShotCard";
import TabNavigation from "../components/TabNavigation";
import TimelineEditor from "../components/timeline/TimelineEditor";
import StoryboardModeView from "../components/StoryboardModeView";
import EditorModeView from "../components/EditorModeView";
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
import { ModelPicker } from "../components/ModelPicker";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  getStoryboard,
  updateStoryboard,
  updateStoryboardModels,
  getShots,
  createShot,
  updateShot,
  deleteShot,
  reorderShots,
  getShotImageBase64,
  copyImageFromShot,
  getTimelineEdits,
  getImageVersions,
  getCurrentImageVersion,
  getVersionCount,
  switchToVersion,
  createGenerationVersion,
  createRemixVersion,
  getVersionImageBase64,
  getVideoVersions,
  getCurrentVideoVersion,
  getVideoVersionCount,
  switchToVideoVersion,
} from "../lib/tauri-api";
import type {
  Storyboard,
  ShotWithUrls,
  TimelineEdit,
  ImageVersionNode,
  ImageVersionWithUrl,
  VideoVersionNode,
  VideoVersionWithUrl,
} from "../lib/tauri-api";
import {
  generateImageAction,
  editImageAction,
  generateVideoPromptFromImage,
  enhanceVideoPrompt,
  generateAndSaveVideoAction,
} from "../actions/generation-actions";
import { videoAssembler } from "../lib/video-assembler";
import { save } from "@tauri-apps/plugin-dialog";
import { saveAssembledVideo } from "../lib/tauri-api";
import {
  ImageModelId,
  VideoModelId,
  getAvailableImageModels,
  getAvailableVideoModels,
  getGroupedVideoModels,
  getGroupedImageModels,
} from "../lib/models";
import type { VideoGenerationSettings } from "../lib/models/types";

interface Shot {
  id: string;
  storyboard_id: string;
  order: number;
  duration: number;
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

function shotFromShotWithUrls(s: ShotWithUrls): Shot {
  return {
    id: s.id,
    storyboard_id: s.storyboard_id,
    order: s.order,
    duration: s.duration,
    image_prompt: s.image_prompt,
    image_url: s.image_url,
    video_prompt: s.video_prompt,
    video_url: s.video_url,
    status: s.status as Shot["status"],
    created_at: s.created_at,
    updated_at: s.updated_at,
  };
}

export default function StoryboardPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [storyboard, setStoryboard] = useState<Storyboard | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");

  // Selection State
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);

  // Tab State
  const [activeTab, setActiveTab] = useState<"storyboard" | "editor">("storyboard");

  // Timeline Edit State
  const [timelineEdits, setTimelineEdits] = useState<TimelineEdit[]>([]);

  // Assembly State
  const [isAssembling, setIsAssembling] = useState(false);

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
  const videoGroups = getGroupedVideoModels();
  const imageGroups = getGroupedImageModels();

  // Video Settings
  const [videoSettings, setVideoSettings] = useState<VideoGenerationSettings>(() => {
    const model = videoModels.find((m) => m.id === "veo3");
    return model?.defaults ?? { duration: "8" };
  });

  const currentVideoModel = useMemo(
    () => videoModels.find((m) => m.id === videoModel),
    [videoModel, videoModels]
  );

  const hasConfigurableSettings = useMemo(() => {
    if (!currentVideoModel) return false;
    const caps = currentVideoModel.capabilities;
    return (
      caps.durations.length > 1 ||
      (caps.resolutions?.length ?? 0) > 1 ||
      (caps.aspectRatios?.length ?? 0) > 1 ||
      caps.hasAudio === true
    );
  }, [currentVideoModel]);

  // Image Version State - per shot
  const [shotVersions, setShotVersions] = useState<Record<string, ImageVersionNode[]>>({});
  const [shotCurrentVersions, setShotCurrentVersions] = useState<Record<string, ImageVersionWithUrl | null>>({});
  const [shotVersionCounts, setShotVersionCounts] = useState<Record<string, number>>({});

  // Video Version State - per shot
  const [shotVideoVersions, setShotVideoVersions] = useState<Record<string, VideoVersionNode[]>>({});
  const [shotCurrentVideoVersions, setShotCurrentVideoVersions] = useState<Record<string, VideoVersionWithUrl | null>>({});
  const [shotVideoVersionCounts, setShotVideoVersionCounts] = useState<Record<string, number>>({});

  // Edit Modal State
  const [editModalState, setEditModalState] = useState<{
    isOpen: boolean;
    shotId: string | null;
    versionId: string | null;
    sourceImageUrl: string | null;
  }>({ isOpen: false, shotId: null, versionId: null, sourceImageUrl: null });
  const [editPrompt, setEditPrompt] = useState("");
  const [isEditingImage, setIsEditingImage] = useState(false);

  // Prompt Generation State - track per shot
  const [generatingPromptShots, setGeneratingPromptShots] = useState<Set<string>>(new Set());
  const [enhancingPromptShots, setEnhancingPromptShots] = useState<Set<string>>(new Set());

  // Load storyboard and shots on mount
  useEffect(() => {
    if (id) loadData();
  }, [id]);

  async function loadData() {
    if (!id) return;
    setIsLoading(true);
    try {
      const [storyboardData, shotsData, editsData] = await Promise.all([
        getStoryboard(id),
        getShots(id),
        getTimelineEdits(id),
      ]);

      if (!storyboardData) {
        navigate("/");
        return;
      }

      setStoryboard(storyboardData);
      const mappedShots = shotsData.map(shotFromShotWithUrls);
      setShots(mappedShots);
      if (mappedShots.length > 0) {
        setSelectedShotId(mappedShots[0].id);
      }
      setTimelineEdits(editsData);
      setEditedName(storyboardData.name);
      setImageModel((storyboardData.image_model as ImageModelId) || "imagen4");
      const loadedVideoModel = (storyboardData.video_model as VideoModelId) || "veo3";
      setVideoModel(loadedVideoModel);
      const loadedModel = videoModels.find((m) => m.id === loadedVideoModel);
      if (loadedModel) {
        setVideoSettings({ ...loadedModel.defaults });
      }

      // Load version data for each shot
      await loadVersionDataForShots(mappedShots);
    } catch (error) {
      console.error("Failed to load storyboard:", error);
      navigate("/");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadVersionDataForShots(shotsData: Shot[]) {
    const versionsMap: Record<string, ImageVersionNode[]> = {};
    const currentVersionsMap: Record<string, ImageVersionWithUrl | null> = {};
    const countsMap: Record<string, number> = {};
    const videoVersionsMap: Record<string, VideoVersionNode[]> = {};
    const videoCurrentVersionsMap: Record<string, VideoVersionWithUrl | null> = {};
    const videoCountsMap: Record<string, number> = {};

    await Promise.all(
      shotsData.map(async (shot) => {
        const [versions, currentVersion, count, videoVersions, currentVideoVersion, videoCount] = await Promise.all([
          getImageVersions(shot.id),
          getCurrentImageVersion(shot.id),
          getVersionCount(shot.id),
          getVideoVersions(shot.id),
          getCurrentVideoVersion(shot.id),
          getVideoVersionCount(shot.id),
        ]);
        versionsMap[shot.id] = versions;
        currentVersionsMap[shot.id] = currentVersion;
        countsMap[shot.id] = count;
        videoVersionsMap[shot.id] = videoVersions;
        videoCurrentVersionsMap[shot.id] = currentVideoVersion;
        videoCountsMap[shot.id] = videoCount;
      })
    );

    setShotVersions(versionsMap);
    setShotCurrentVersions(currentVersionsMap);
    setShotVersionCounts(countsMap);
    setShotVideoVersions(videoVersionsMap);
    setShotCurrentVideoVersions(videoCurrentVersionsMap);
    setShotVideoVersionCounts(videoCountsMap);
  }

  async function refreshVersionData(shotId: string) {
    const [versions, currentVersion, count, videoVersions, currentVideoVersion, videoCount] = await Promise.all([
      getImageVersions(shotId),
      getCurrentImageVersion(shotId),
      getVersionCount(shotId),
      getVideoVersions(shotId),
      getCurrentVideoVersion(shotId),
      getVideoVersionCount(shotId),
    ]);
    setShotVersions((prev) => ({ ...prev, [shotId]: versions }));
    setShotCurrentVersions((prev) => ({ ...prev, [shotId]: currentVersion }));
    setShotVersionCounts((prev) => ({ ...prev, [shotId]: count }));
    setShotVideoVersions((prev) => ({ ...prev, [shotId]: videoVersions }));
    setShotCurrentVideoVersions((prev) => ({ ...prev, [shotId]: currentVideoVersion }));
    setShotVideoVersionCounts((prev) => ({ ...prev, [shotId]: videoCount }));
  }

  async function handleUpdateStoryboardName() {
    if (!id || !editedName.trim() || editedName === storyboard?.name) {
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
    if (!id) return;
    setImageModel(newModel);
    try {
      await updateStoryboardModels(id, newModel, videoModel);
    } catch (error) {
      console.error("Failed to update model selection:", error);
    }
  }

  async function handleChangeVideoModel(newModel: VideoModelId) {
    if (!id) return;
    setVideoModel(newModel);
    // Reset settings to new model's defaults
    const model = videoModels.find((m) => m.id === newModel);
    if (model) {
      setVideoSettings({ ...model.defaults });
    }
    try {
      await updateStoryboardModels(id, imageModel, newModel);
    } catch (error) {
      console.error("Failed to update model selection:", error);
    }
  }

  // --- Shot Actions ---

  async function handleAddShot() {
    if (!id) return;
    try {
      const newShotData = await createShot(id);
      const newShot = shotFromShotWithUrls(newShotData);
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
    } catch (error) {
      console.error("Failed to delete shot:", error);
      alert("Failed to delete shot");
    }
  }

  async function handleMoveShot(index: number, direction: "up" | "down") {
    if (!id) return;
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
    if (!id || !activeShotId || !imagePrompt) return;

    setIsGeneratingImage(true);
    try {
      const imageDataUrl = await generateImageAction(imagePrompt, imageModel);

      // Get current version to use as parent (if exists)
      const currentVersion = shotCurrentVersions[activeShotId];

      // Create a new version
      await createGenerationVersion(
        activeShotId,
        imagePrompt,
        imageDataUrl,
        currentVersion?.id || null
      );

      // Reload shot data and version data
      const updatedShots = await getShots(id);
      setShots(updatedShots.map(shotFromShotWithUrls));
      await refreshVersionData(activeShotId);

      setIsModalOpen(false);
      // Reset final video since content changed
    } catch (error) {
      console.error("Image generation failed", error);
      alert("Failed to generate image");
    } finally {
      setIsGeneratingImage(false);
    }
  }

  async function handleUploadImage(shotId: string, file: File) {
    if (!id) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      if (typeof e.target?.result === "string") {
        try {
          // Get current version to use as parent (if exists)
          const currentVersion = shotCurrentVersions[shotId];

          // Create a new version for uploaded image
          await createGenerationVersion(
            shotId,
            "Uploaded image",
            e.target.result,
            currentVersion?.id || null
          );

          // Reload shot data and version data
          const updatedShots = await getShots(id);
          setShots(updatedShots.map(shotFromShotWithUrls));
          await refreshVersionData(shotId);

          // Reset final video since content changed
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
        const mapped = shotFromShotWithUrls(updatedShot);
        setShots((prev) =>
          prev.map((s) => (s.id === targetShotId ? mapped : s))
        );
      }
      await refreshVersionData(targetShotId);
      // Reset final video since content changed
    } catch (error) {
      console.error("Failed to copy image:", error);
      alert("Failed to copy image");
    }
  }

  // --- Version Handlers ---

  async function handleVersionSelect(shotId: string, versionId: string) {
    if (!id) return;
    try {
      await switchToVersion(shotId, versionId);
      // Reload shot data and version data
      const updatedShots = await getShots(id);
      setShots(updatedShots.map(shotFromShotWithUrls));
      await refreshVersionData(shotId);
      // Reset final video since content changed
    } catch (error) {
      console.error("Failed to switch version:", error);
      alert("Failed to switch version");
    }
  }

  async function handleVideoVersionSelect(shotId: string, versionId: string) {
    if (!id) return;
    try {
      await switchToVideoVersion(shotId, versionId);
      // Reload shot data and version data
      const updatedShots = await getShots(id);
      setShots(updatedShots.map(shotFromShotWithUrls));
      await refreshVersionData(shotId);
      // Reset final video since content changed
    } catch (error) {
      console.error("Failed to switch video version:", error);
      alert("Failed to switch video version");
    }
  }

  async function handleBranchFrom(shotId: string, versionId: string) {
    // Open the image generation modal with the version as context
    setActiveShotId(shotId);
    setImagePrompt("");
    setIsModalOpen(true);
  }

  async function handleOpenEditModal(shotId: string, versionId: string) {
    const version = shotCurrentVersions[shotId];
    if (!version) return;

    setEditModalState({
      isOpen: true,
      shotId,
      versionId,
      sourceImageUrl: version.image_url,
    });
    setEditPrompt("");
  }

  async function handleEditImage() {
    if (!id) return;
    const { shotId, versionId } = editModalState;
    if (!shotId || !versionId || !editPrompt.trim()) return;

    setIsEditingImage(true);
    try {
      // Get source image as base64
      const sourceBase64 = await getVersionImageBase64(versionId);
      if (!sourceBase64) {
        throw new Error("Failed to load source image");
      }

      // Call edit image action
      const resultBase64 = await editImageAction(sourceBase64, editPrompt, imageModel);

      // Create a new remix version
      await createRemixVersion(shotId, versionId, editPrompt, resultBase64);

      // Reload data
      const updatedShots = await getShots(id);
      setShots(updatedShots.map(shotFromShotWithUrls));
      await refreshVersionData(shotId);

      setEditModalState({ isOpen: false, shotId: null, versionId: null, sourceImageUrl: null });
    } catch (error) {
      console.error("Image edit failed:", error);
      alert("Failed to edit image");
    } finally {
      setIsEditingImage(false);
    }
  }

  // --- Video Generation (Per-Shot) ---

  async function handleGenerateVideo(shotId: string) {
    const shot = shots.find((s) => s.id === shotId);
    if (!shot) return;

    // Set this shot to generating status
    setShots((prev) =>
      prev.map((s) =>
        s.id === shotId ? { ...s, status: "generating" as const, video_url: null } : s
      )
    );

    // Use the combined generate-and-save action (avoids 10MB body size limit)
    const result = await generateAndSaveVideoAction(
      shotId,
      shot.video_prompt || "",
      videoModel,
      videoSettings
    );

    if (result.success && result.videoUrl) {
      setShots((prev) =>
        prev.map((s) =>
          s.id === shotId
            ? { ...s, status: "complete" as const, video_url: result.videoUrl }
            : s
        )
      );
      // Refresh video version data
      await refreshVersionData(shotId);
    } else {
      const errorMessage = result.error || "Video generation failed";
      console.error(`Video generation failed for shot ${shotId}:`, errorMessage);
      setShots((prev) =>
        prev.map((s) =>
          s.id === shotId
            ? { ...s, status: "failed" as const, error_message: errorMessage }
            : s
        )
      );
    }
  }

  // --- Prompt Generation ---

  async function handleGenerateVideoPrompt(shotId: string) {
    // Add to loading set
    setGeneratingPromptShots((prev) => new Set(prev).add(shotId));

    try {
      // Get image as base64
      const imageBase64 = await getShotImageBase64(shotId);
      if (!imageBase64) {
        throw new Error("No image available for this shot");
      }

      // Generate prompt from image
      const generatedPrompt = await generateVideoPromptFromImage(imageBase64);

      // Update the shot with the generated prompt
      await handleUpdateShot(shotId, { video_prompt: generatedPrompt });
    } catch (error) {
      console.error("Failed to generate video prompt:", error);
      alert(error instanceof Error ? error.message : "Failed to generate prompt");
    } finally {
      setGeneratingPromptShots((prev) => {
        const newSet = new Set(prev);
        newSet.delete(shotId);
        return newSet;
      });
    }
  }

  async function handleEnhanceVideoPrompt(shotId: string) {
    const shot = shots.find((s) => s.id === shotId);
    if (!shot?.video_prompt?.trim()) return;

    // Add to loading set
    setEnhancingPromptShots((prev) => new Set(prev).add(shotId));

    try {
      // Enhance the existing prompt
      const enhancedPrompt = await enhanceVideoPrompt(shot.video_prompt);

      // Update the shot with the enhanced prompt
      await handleUpdateShot(shotId, { video_prompt: enhancedPrompt });
    } catch (error) {
      console.error("Failed to enhance video prompt:", error);
      alert(error instanceof Error ? error.message : "Failed to enhance prompt");
    } finally {
      setEnhancingPromptShots((prev) => {
        const newSet = new Set(prev);
        newSet.delete(shotId);
        return newSet;
      });
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
      const videoBytes = await videoAssembler.assembleVideos(videoUrls);

      const defaultFilename = `${storyboard?.name.replace(/\s+/g, "_") || "movie"}.mp4`;
      const savePath = await save({
        defaultPath: defaultFilename,
        filters: [{ name: "Video", extensions: ["mp4"] }],
      });

      if (savePath) {
        await saveAssembledVideo(Array.from(videoBytes), savePath);
        alert("Video exported successfully!");
      }
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
    <div className="bg-background flex flex-col h-dvh overflow-hidden">
      {/* Main App Header */}
      <Header
        backHref={`/project/${storyboard.project_id}`}
        backLabel="Project"
        title={storyboard.name}
      >
        {/* Inline controls in header */}
        <div className="flex items-center gap-4">
          <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />

          {/* Model Selectors — storyboard tab only */}
          {activeTab === "storyboard" && <div className="flex items-center gap-2">
            <ModelPicker
              groups={imageGroups}
              value={imageModel}
              onSelect={(id) => handleChangeImageModel(id as ImageModelId)}
              trigger={
                <Button variant="outline" size="sm" className="gap-2">
                  <ImageIcon className="h-4 w-4" />
                  {imageModels.find((m) => m.id === imageModel)?.name || "Image"}
                </Button>
              }
            />

            <ModelPicker
              groups={videoGroups}
              value={videoModel}
              onSelect={(id) => handleChangeVideoModel(id as VideoModelId)}
              trigger={
                <Button variant="outline" size="sm" className="gap-2">
                  <Video className="h-4 w-4" />
                  {videoModels.find((m) => m.id === videoModel)?.name || "Video"}
                </Button>
              }
            />

            {/* Video Settings Popover */}
            {hasConfigurableSettings && currentVideoModel && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1 px-2">
                    <SlidersHorizontal className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-56 space-y-4">
                  <p className="text-xs font-medium text-muted-foreground">
                    {currentVideoModel.name} Settings
                  </p>

                  {currentVideoModel.capabilities.durations.length > 1 && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">Duration</label>
                      <Select
                        value={videoSettings.duration}
                        onValueChange={(v) =>
                          setVideoSettings((prev) => ({ ...prev, duration: v }))
                        }
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {currentVideoModel.capabilities.durations.map((d) => (
                            <SelectItem key={d} value={d}>
                              {d}s
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {(currentVideoModel.capabilities.resolutions?.length ?? 0) > 1 && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">Resolution</label>
                      <Select
                        value={videoSettings.resolution ?? ""}
                        onValueChange={(v) =>
                          setVideoSettings((prev) => ({ ...prev, resolution: v }))
                        }
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {currentVideoModel.capabilities.resolutions!.map((r) => (
                            <SelectItem key={r} value={r}>
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {(currentVideoModel.capabilities.aspectRatios?.length ?? 0) > 1 && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">Aspect Ratio</label>
                      <Select
                        value={videoSettings.aspectRatio ?? ""}
                        onValueChange={(v) =>
                          setVideoSettings((prev) => ({ ...prev, aspectRatio: v }))
                        }
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {currentVideoModel.capabilities.aspectRatios!.map((a) => (
                            <SelectItem key={a} value={a}>
                              {a}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {currentVideoModel.capabilities.hasAudio && (
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium">Audio</label>
                      <Switch
                        checked={videoSettings.audio ?? false}
                        onCheckedChange={(checked) =>
                          setVideoSettings((prev) => ({ ...prev, audio: checked }))
                        }
                      />
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            )}
          </div>}

          <Badge variant="secondary" className="text-sm">
            {shots.length} Shots • {totalDuration}s Total
          </Badge>
          {activeTab === "storyboard" && (
            <Button
              variant="outline"
              size="sm"
              className="text-primary"
              onClick={handleExport}
              disabled={isAssembling || !allShotsComplete}
            >
              {isAssembling ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Assembling...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Movie
                </>
              )}
            </Button>
          )}
        </div>
      </Header>

      {activeTab === "storyboard" && (
        <StoryboardModeView
          shotListSlot={
            <div className="h-full overflow-y-auto p-2">
              {shots.map((shot, index) => {
                const otherShotsWithImages = shots
                  .filter((s) => s.id !== shot.id && s.image_url)
                  .map((s) => ({ id: s.id, order: s.order, image_url: s.image_url! }));
                return (
                  <div
                    key={shot.id}
                    className={`mb-2 cursor-pointer rounded ${
                      selectedShotId === shot.id ? "ring-2 ring-primary" : ""
                    }`}
                    onClick={() => setSelectedShotId(shot.id)}
                  >
                    <ShotCard
                      shot={mapShotToCardData(shot)}
                      index={index}
                      totalShots={shots.length}
                      otherShotsWithImages={otherShotsWithImages}
                      versions={shotVersions[shot.id] || []}
                      currentVersion={shotCurrentVersions[shot.id] || null}
                      versionCount={shotVersionCounts[shot.id] || 0}
                      videoVersions={shotVideoVersions[shot.id] || []}
                      currentVideoVersion={shotCurrentVideoVersions[shot.id] || null}
                      videoVersionCount={shotVideoVersionCounts[shot.id] || 0}
                      onUpdate={handleUpdateShot}
                      onDelete={handleDeleteShot}
                      onMove={handleMoveShot}
                      onGenerateImage={openImageModal}
                      onUploadImage={handleUploadImage}
                      onCopyImageFromShot={handleCopyImageFromShot}
                      onGenerateVideo={handleGenerateVideo}
                      onVersionSelect={handleVersionSelect}
                      onBranchFrom={handleBranchFrom}
                      onEditImage={handleOpenEditModal}
                      onVideoVersionSelect={handleVideoVersionSelect}
                      onGenerateVideoPrompt={handleGenerateVideoPrompt}
                      onEnhanceVideoPrompt={handleEnhanceVideoPrompt}
                      isGeneratingPrompt={generatingPromptShots.has(shot.id)}
                      isEnhancingPrompt={enhancingPromptShots.has(shot.id)}
                    />
                  </div>
                );
              })}
              <button
                onClick={handleAddShot}
                className="w-full py-4 border-2 border-dashed border-border rounded flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors mt-2"
              >
                <Plus className="h-5 w-5 mr-2" />
                Add Shot
              </button>
            </div>
          }
          previewSlot={
            <div className="h-full flex items-center justify-center text-muted-foreground">
              {selectedShotId ? (
                <p className="text-sm">Shot preview — Card 4 will replace this</p>
              ) : (
                <p className="text-sm">Select a shot to preview</p>
              )}
            </div>
          }
          inspectorSlot={
            <div className="h-full flex items-center justify-center text-muted-foreground">
              {selectedShotId ? (
                <p className="text-sm">Inspector — Card 5 will replace this</p>
              ) : (
                <p className="text-sm">Select a shot to inspect</p>
              )}
            </div>
          }
        />
      )}

      {activeTab === "editor" && (
        <EditorModeView
          mediaPoolSlot={
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <p className="text-sm">Media pool — Card 6 will replace this</p>
            </div>
          }
          viewerSlot={
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <p className="text-sm">Viewer — Card 6 will replace this</p>
            </div>
          }
          detailTimelineSlot={
            <TimelineEditor
              storyboardId={id!}
              shots={shots}
              edits={timelineEdits}
              onEditsChange={setTimelineEdits}
            />
          }
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

      {/* Image Edit Modal */}
      <Dialog
        open={editModalState.isOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEditModalState({ isOpen: false, shotId: null, versionId: null, sourceImageUrl: null });
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Edit Image with {imageModels.find((m) => m.id === imageModel)?.name}
            </DialogTitle>
            <DialogDescription>
              Describe how you want to modify this image.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            {editModalState.sourceImageUrl && (
              <div className="aspect-video bg-muted rounded-lg overflow-hidden">
                <img
                  src={editModalState.sourceImageUrl}
                  alt="Source image"
                  className="w-full h-full object-contain"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Edit Prompt
              </label>
              <Textarea
                className="min-h-[80px]"
                placeholder="Describe the changes (e.g., 'Make the sky more dramatic' or 'Add fog in the background')"
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() =>
                setEditModalState({ isOpen: false, shotId: null, versionId: null, sourceImageUrl: null })
              }
            >
              Cancel
            </Button>
            <Button
              onClick={handleEditImage}
              disabled={isEditingImage || !editPrompt.trim()}
            >
              {isEditingImage ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Editing...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Edit Image
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
