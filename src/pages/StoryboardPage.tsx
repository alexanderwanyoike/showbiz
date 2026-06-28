import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useParams } from "react-router";
import { Plus, Loader2, Sparkles, ImageIcon, Video, Save } from "lucide-react";
import { Header } from "../components/Header";
import ShotCard from "../components/ShotCard";
import ShotList from "../components/ShotList";
import ShotPreview from "../components/ShotPreview";
import ShotInspector from "../components/ShotInspector";
import MediaPool from "../components/MediaPool";
import TabNavigation from "../components/TabNavigation";
import TimelineEditor from "../components/timeline/TimelineEditor";
import StoryboardModeView from "../components/StoryboardModeView";

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
  ensureDefaultTracks,
  getTimelineClips,
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
  getBibles,
  getBibleAssets,
  getBibleAssetVariants,
  getBibleVariantImageBase64,
  getShotEndFrameBase64,
  saveShotEndFrame,
  clearShotEndFrame,
} from "../lib/tauri-api";
import type {
  Storyboard,
  ShotWithUrls,
  TimelineEdit,
  TimelineTrack,
  TimelineClipRow,
  ImageVersionNode,
  ImageVersionWithUrl,
  VideoVersionNode,
  VideoVersionWithUrl,
  BibleAsset,
  BibleAssetVariant,
} from "../lib/tauri-api";
import {
  generateImageAction,
  editImageAction,
  generateVideoPromptFromImage,
  enhanceVideoPrompt,
  generateAndSaveVideoRequestAction,
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
import { chooseVideoGenerationMode, validateVideoGenerationRequest } from "../lib/generation/video-modes";
import type { VideoGenerationRequest } from "../lib/generation/types";
import type { ShotFrameRole, FrameOption } from "../components/ShotInspector";
import {
  invalidateGenerationRun,
  isCurrentGenerationRun,
  startGenerationRun,
  type GenerationRunMap,
} from "../lib/generation/run-guard";

interface Shot {
  id: string;
  storyboard_id: string;
  order: number;
  duration: number;
  image_prompt: string | null;
  image_url: string | null;
  end_frame_url: string | null;
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

type ShotUpdateInput = Partial<Pick<Shot, "video_prompt" | "status">>;

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
    end_frame_url: s.end_frame_url,
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
  const [timelineTracks, setTimelineTracks] = useState<TimelineTrack[]>([]);
  const [timelineClipRows, setTimelineClipRows] = useState<TimelineClipRow[]>([]);
  const [bibleAssets, setBibleAssets] = useState<BibleAsset[]>([]);
  const [bibleVariants, setBibleVariants] = useState<Record<string, BibleAssetVariant[]>>({});

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

  // Frames composed in the Bible (scene assets) that a shot can pick as start/end.
  const frameOptions: FrameOption[] = useMemo(() => {
    return bibleAssets
      .filter((a) => a.asset_type === "reference")
      .map((a) => {
        const pics = bibleVariants[a.id] ?? [];
        const pic = pics.find((v) => v.is_primary && v.media_url) ?? pics.find((v) => v.media_url);
        return pic ? { variantId: pic.id, label: a.name } : null;
      })
      .filter((f): f is FrameOption => !!f);
  }, [bibleAssets, bibleVariants]);

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
  const videoGenerationRuns = useRef<GenerationRunMap>({});

  // Load storyboard and shots on mount
  useEffect(() => {
    if (id) loadData();
  }, [id]);

  async function loadData() {
    if (!id) return;
    setIsLoading(true);
    try {
      const [storyboardData, shotsData, editsData, tracksData, clipsData] = await Promise.all([
        getStoryboard(id),
        getShots(id),
        getTimelineEdits(id),
        ensureDefaultTracks(id),
        getTimelineClips(id),
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
      setTimelineTracks(tracksData);
      setTimelineClipRows(clipsData);
      setEditedName(storyboardData.name);
      setImageModel((storyboardData.image_model as ImageModelId) || "imagen4");
      const loadedVideoModel = (storyboardData.video_model as VideoModelId) || "veo3";
      setVideoModel(loadedVideoModel);
      const loadedModel = videoModels.find((m) => m.id === loadedVideoModel);
      if (loadedModel) {
        setVideoSettings({ ...loadedModel.defaults });
      }

      await loadBibleData(storyboardData);

      // Load version data for each shot
      await loadVersionDataForShots(mappedShots);
    } catch (error) {
      console.error("Failed to load storyboard:", error);
      navigate("/");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadBibleData(storyboardData: Storyboard) {
    const bibles = await getBibles(storyboardData.project_id);
    const assets = (await Promise.all(bibles.map((bible) => getBibleAssets(bible.id)))).flat();
    setBibleAssets(assets);
    const variantEntries = await Promise.all(
      assets.map(async (asset) => [asset.id, await getBibleAssetVariants(asset.id)] as const)
    );
    setBibleVariants(Object.fromEntries(variantEntries));
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
    updates: ShotUpdateInput
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
      if (selectedShotId === shotId) {
        setSelectedShotId(null);
      }
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

  async function handleUploadFrame(shotId: string, role: ShotFrameRole, file: File) {
    if (!id) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      if (typeof e.target?.result !== "string") return;
      try {
        await setShotFrameFromDataUrl(shotId, role, e.target.result);
      } catch (error) {
        console.error("Failed to upload frame:", error);
        alert("Failed to upload frame");
      }
    };
    reader.readAsDataURL(file);
  }

  // Set a shot's start or end frame from a base64 data URL.
  // The start frame is versioned (image_versions); the end frame is a single slot.
  async function setShotFrameFromDataUrl(shotId: string, role: ShotFrameRole, dataUrl: string) {
    if (!id) return;
    if (role === "start") {
      const currentVersion = shotCurrentVersions[shotId];
      await createGenerationVersion(shotId, "Uploaded frame", dataUrl, currentVersion?.id || null);
      await refreshVersionData(shotId);
    } else {
      await saveShotEndFrame(shotId, dataUrl);
    }
    const updatedShots = await getShots(id);
    setShots(updatedShots.map(shotFromShotWithUrls));
  }

  async function handleClearEndFrame(shotId: string) {
    if (!id) return;
    try {
      await clearShotEndFrame(shotId);
      const updatedShots = await getShots(id);
      setShots(updatedShots.map(shotFromShotWithUrls));
    } catch (error) {
      console.error("Failed to clear end frame:", error);
    }
  }

  // Use a frame composed in the Bible as the shot's start/end frame.
  async function handlePickFrame(shotId: string, role: ShotFrameRole, variantId: string) {
    if (!id) return;
    try {
      const dataUrl = await getBibleVariantImageBase64(variantId);
      if (!dataUrl) {
        alert("That frame has no image yet.");
        return;
      }
      await setShotFrameFromDataUrl(shotId, role, dataUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Failed to set frame:", message);
      alert(`Failed to set frame: ${message}`);
    }
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
    if (!currentVideoModel) return;
    const runId = startGenerationRun(videoGenerationRuns.current, shotId);

    const prompt = shot.video_prompt?.trim() ?? "";
    if (!shot.image_url && !prompt) {
      setShots((prev) =>
        prev.map((s) =>
          s.id === shotId
            ? { ...s, status: "failed" as const, error_message: "Add a start frame or a prompt before generating." }
            : s
        )
      );
      return;
    }

    setShots((prev) =>
      prev.map((s) =>
        s.id === shotId
          ? { ...s, status: "generating" as const, video_url: null, error_message: null }
          : s
      )
    );

    try {
      const startImage = shot.image_url ? await getShotImageBase64(shotId) : null;
      const supportsEndFrame = currentVideoModel.modeCapabilities.imageToVideo?.supportsEndImage === true;
      const endImage =
        supportsEndFrame && shot.end_frame_url ? await getShotEndFrameBase64(shotId) : null;
      const mode = chooseVideoGenerationMode(currentVideoModel.modeCapabilities, {
        hasStartImage: !!startImage,
      });
      const request: VideoGenerationRequest = {
        mode,
        prompt,
        settings: videoSettings,
        startImage,
        endImage: mode === "image-to-video" ? endImage : null,
      };
      validateVideoGenerationRequest(currentVideoModel.modeCapabilities, request);

      const result = await generateAndSaveVideoRequestAction(shotId, videoModel, request);
      if (!isCurrentGenerationRun(videoGenerationRuns.current, shotId, runId)) return;

      if (result.success && result.videoUrl) {
        setShots((prev) =>
          prev.map((s) =>
            s.id === shotId
              ? { ...s, status: "complete" as const, video_url: result.videoUrl }
              : s
          )
        );
        await refreshVersionData(shotId);
        return;
      }

      const errorMessage = result.error || "Video generation failed";
      console.error(`Video generation failed for shot ${shotId}:`, errorMessage);
      setShots((prev) =>
        prev.map((s) =>
          s.id === shotId
            ? { ...s, status: "failed" as const, error_message: errorMessage }
            : s
        )
      );
    } catch (error) {
      if (!isCurrentGenerationRun(videoGenerationRuns.current, shotId, runId)) return;
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Video generation preflight failed for shot ${shotId}:`, errorMessage);
      setShots((prev) =>
        prev.map((s) =>
          s.id === shotId
            ? { ...s, status: "failed" as const, error_message: errorMessage }
            : s
        )
      );
    }
  }

  async function handleCancelVideoGeneration(shotId: string) {
    invalidateGenerationRun(videoGenerationRuns.current, shotId);
    const errorMessage = "Stopped waiting locally. The provider job may still finish remotely.";
    setShots((prev) =>
      prev.map((s) =>
        s.id === shotId
          ? { ...s, status: "failed" as const, error_message: errorMessage }
          : s
      )
    );
    try {
      await updateShot(shotId, { status: "failed" });
    } catch (error) {
      console.error("Failed to persist cancelled generation status:", error);
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
            <ShotList
              shots={shots.map(shot => ({
                id: shot.id,
                order: shot.order,
                image_prompt: shot.image_prompt,
                video_prompt: shot.video_prompt,
                image_url: shot.image_url,
                video_url: shot.video_url,
                status: shot.status,
              }))}
              selectedShotId={selectedShotId}
              onSelectShot={setSelectedShotId}
              onAddShot={handleAddShot}
              onMoveShot={handleMoveShot}
              onDeleteShot={handleDeleteShot}
            />
          }
          previewSlot={
            <ShotPreview
              shot={selectedShotId ? (() => {
                const s = shots.find(s => s.id === selectedShotId);
                return s ? {
                  id: s.id,
                  order: s.order,
                  image_url: s.image_url,
                  video_url: s.video_url,
                  status: s.status,
                } : null;
              })() : null}
            />
          }
          inspectorSlot={
            <ShotInspector
              shot={selectedShotId ? (() => {
                const s = shots.find(s => s.id === selectedShotId);
                return s ? {
                  id: s.id,
                  order: s.order,
                  image_prompt: s.image_prompt,
                  image_url: s.image_url,
                  end_frame_url: s.end_frame_url,
                  video_prompt: s.video_prompt,
                  video_url: s.video_url,
                  status: s.status,
                  error_message: s.error_message,
                } : null;
              })() : null}
              frameOptions={frameOptions}
              onPickFrame={handlePickFrame}
              onUploadFrame={handleUploadFrame}
              onClearEndFrame={handleClearEndFrame}
              onGenerateVideo={handleGenerateVideo}
              onCancelVideoGeneration={handleCancelVideoGeneration}
              onUpdateShot={(shotId, updates) => handleUpdateShot(shotId, updates)}
              videoModel={currentVideoModel ?? null}
              videoSettings={videoSettings}
              onVideoSettingsChange={setVideoSettings}
              versions={selectedShotId ? (shotVersions[selectedShotId] || []) : []}
              currentVersion={selectedShotId ? (shotCurrentVersions[selectedShotId] || null) : null}
              versionCount={selectedShotId ? (shotVersionCounts[selectedShotId] || 0) : 0}
              videoVersions={selectedShotId ? (shotVideoVersions[selectedShotId] || []) : []}
              currentVideoVersion={selectedShotId ? (shotCurrentVideoVersions[selectedShotId] || null) : null}
              videoVersionCount={selectedShotId ? (shotVideoVersionCounts[selectedShotId] || 0) : 0}
              onVersionSelect={handleVersionSelect}
              onBranchFrom={handleBranchFrom}
              onEditImage={handleOpenEditModal}
              onVideoVersionSelect={handleVideoVersionSelect}
              onGenerateVideoPrompt={handleGenerateVideoPrompt}
              onEnhanceVideoPrompt={handleEnhanceVideoPrompt}
              isGeneratingPrompt={selectedShotId ? generatingPromptShots.has(selectedShotId) : false}
              isEnhancingPrompt={selectedShotId ? enhancingPromptShots.has(selectedShotId) : false}
            />
          }
        />
      )}

      {activeTab === "editor" && (
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Media Pool — left sidebar */}
          <div className="w-56 flex-shrink-0 border-r border-border overflow-hidden">
            <MediaPool
              shots={shots.map(s => ({
                id: s.id,
                order: s.order,
                image_url: s.image_url,
                video_url: s.video_url,
                status: s.status,
                duration: 8,
              }))}
            />
          </div>
          {/* Timeline Editor — fills remaining space (has its own preview + transport) */}
          <TimelineEditor
            storyboardId={id!}
            shots={shots}
            edits={timelineEdits}
            onEditsChange={setTimelineEdits}
            tracks={timelineTracks}
            clipRows={timelineClipRows}
            onTracksChange={setTimelineTracks}
            onClipsChange={setTimelineClipRows}
          />
        </div>
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
