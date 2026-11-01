import { ConfirmDeletion } from "../components/ConfirmDeletion";
import { resolveShotVideoSettings, storeShotVideoSettings } from "../lib/shot-video-settings";
import type { StoryboardSettingsValues } from "../../shared/storyboard-settings";
import type { Result } from "../../shared/result";
import { StoryboardSettingsDialog } from "../components/StoryboardSettingsDialog";
import { GenerationCost } from "../components/GenerationCost";
import { ShotModelControls } from "../components/ShotModelControls";
import { resolveShotModels } from "../lib/shot-models";
import { DEFAULT_STORYBOARD_MODELS } from "../../shared/model-defaults";
import type { ShotModelOverrides } from "../../shared/shot-models";
import { useAgentChanges } from "../hooks/useAgentChanges";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useUnsavedWork } from "../hooks/useApplicationWork";
import { withApplicationWork } from "../lib/application-work";
import { useState, useEffect, useMemo, useRef, useId } from "react";
import { useNavigate, useParams } from "react-router";
import { Loader2, Sparkles, ImageIcon, Share, PanelRight } from "lucide-react";
import { WorkspaceCommand } from "../components/WorkspaceCommand";
import { WorkspaceToolbar as Header } from "../components/WorkspaceToolbar";
import ShotList from "../components/ShotList";
import ShotPreview from "../components/ShotPreview";
import ShotInspector from "../components/ShotInspector";
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
import {
  getStoryboard,
  updateStoryboardSettings,
  setShotModels,
  setShotVideoSettings,
  getShots,
  createShot,
  updateShot,
  deleteShot,
  reorderShots,
  getShotImageBase64,
  copyImageFromShot,
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
  clearShotStartFrame,
} from "../lib/backend-api";
import type {
  Storyboard,
  ShotWithUrls,
  ImageVersionNode,
  ImageVersionWithUrl,
  VideoVersionNode,
  VideoVersionWithUrl,
  BibleAsset,
  BibleAssetVariant,
} from "../lib/backend-api";
import {
  generateImageAction,
  editImageAction,
  generateVideoPromptFromImage,
  enhanceVideoPrompt,
  generateAndSaveVideoRequestAction,
} from "../actions/generation-actions";
import { invoke } from "../lib/bridge";
import {
  ImageModelId,
  VideoModelId,
  getAvailableImageModels,
  getAvailableVideoModels,
} from "../lib/models";
import { blobToBase64, type VideoGenerationSettings } from "../lib/models/types";
import { chooseVideoGenerationMode, validateVideoGenerationRequest } from "../lib/generation/video-modes";
import type { VideoGenerationRequest } from "../lib/generation/types";
import type { ShotFrameRole, FrameOption } from "../components/ShotInspector";
import { buildFrameOptions } from "../lib/bible-compose";
import { versionsForShot, valueForShot } from "../lib/shot-versions";
import {
  invalidateGenerationRun,
  isCurrentGenerationRun,
  startGenerationRun,
  type GenerationRunMap,
} from "../lib/generation/run-guard";

interface Shot extends ShotModelOverrides {
  video_settings_json?: string | null;
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

type ShotUpdateInput = Partial<Pick<Shot, "video_prompt" | "status">>;

function shotFromShotWithUrls(s: ShotWithUrls): Shot {
  return {
    id: s.id,
    storyboard_id: s.storyboard_id,
    order: s.order,
    duration: s.duration,
    image_model: s.image_model ?? null,
    video_model: s.video_model ?? null,
    video_settings_json: s.video_settings_json ?? null,
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
  const [shotToDelete, setShotToDelete] = useState<Shot | null>(null);
  const shotDeletionFocus = useRef<(() => void) | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Selection State
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  const [shotControlsOpen, setShotControlsOpen] = useState(false);
  const shotControlsId = useId();
  const shotControlsToggle = useRef<HTMLButtonElement>(null);

  const [frameErrors, setFrameErrors] = useState<Record<string,{role:ShotFrameRole;message:string}>>({});
  const [savingFrameShots, setSavingFrameShots] = useState<Set<string>>(new Set());

  const [bibleAssets, setBibleAssets] = useState<BibleAsset[]>([]);
  const [bibleVariants, setBibleVariants] = useState<Record<string, BibleAssetVariant[]>>({});

  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeShotId, setActiveShotId] = useState<string | null>(null);
  const [imagePrompt, setImagePrompt] = useState("");
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [imageGenerationError, setImageGenerationError] = useState<string | null>(null);
  const imagePromptInput = useRef<HTMLTextAreaElement>(null);
  const editPromptInput = useRef<HTMLTextAreaElement>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Model Selection
  const [defaultImageModel, setDefaultImageModel] = useState<ImageModelId>(DEFAULT_STORYBOARD_MODELS.image_model);
  const [defaultVideoModel, setDefaultVideoModel] = useState<VideoModelId>(DEFAULT_STORYBOARD_MODELS.video_model);
  const imageModels = getAvailableImageModels();
  const videoModels = getAvailableVideoModels();
  const [modelSaving, setModelSaving] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const defaultModels = {image_model:defaultImageModel, video_model:defaultVideoModel};
  const selectedShot = shots.find(shot => shot.id === selectedShotId) ?? null;
  const selectedModels = resolveShotModels(selectedShot, defaultModels);
  const imageModel = selectedModels.image_model as ImageModelId;
  const videoModel = selectedModels.video_model as VideoModelId;

  const [videoSettingsDrafts, setVideoSettingsDrafts] = useState<Record<string, {model_id:string;settings:VideoGenerationSettings;error:string|null}>>({});
  const [savingVideoSettingsShots, setSavingVideoSettingsShots] = useState<Set<string>>(new Set());
  const videoSettingsRequests = useRef(new Map<string, { token: symbol; modelId: string }>());
  const videoSettingsSaving = !!selectedShotId && savingVideoSettingsShots.has(selectedShotId);
  const currentVideoModel = useMemo(() => videoModels.find((model) => model.id === videoModel), [videoModel, videoModels]);
  const storedVideoSettings = currentVideoModel ? resolveShotVideoSettings(selectedShot?.video_settings_json, currentVideoModel) : {settings:{duration:"auto"},notice:"Choose a video model."};
  const selectedVideoDraft = selectedShot && videoSettingsDrafts[selectedShot.id]?.model_id === videoModel ? videoSettingsDrafts[selectedShot.id] : null;
  const videoSettings: VideoGenerationSettings = selectedVideoDraft?.settings ?? storedVideoSettings.settings;
  const inactiveVideoDraft = Object.keys(videoSettingsDrafts).find((shotId) => shotId !== selectedShotId);

  const videoCostRequest = {
    kind: "video" as const,
    duration: videoSettings.duration,
    resolution: videoSettings.resolution,
    audio: videoSettings.audio,
    aspect_ratio: videoSettings.aspectRatio,
    mode: currentVideoModel ? chooseVideoGenerationMode(currentVideoModel.modeCapabilities, { hasStartImage: !!selectedShot?.image_url }) : undefined,
    has_end_frame: !!(selectedShot?.end_frame_url && currentVideoModel?.modeCapabilities.imageToVideo?.supportsEndImage),
  };



  // Frames composed in the Bible (scene assets) that a shot can pick as start/end.
  const frameOptions: FrameOption[] = useMemo(
    () => buildFrameOptions(bibleAssets, bibleVariants),
    [bibleAssets, bibleVariants]
  );


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
  const [imageEditError, setImageEditError] = useState<string | null>(null);
  const imageEditOpener = useRef<HTMLElement | null>(null);

  // Prompt Generation State - track per shot
  const [generatingPromptShots, setGeneratingPromptShots] = useState<Set<string>>(new Set());
  const [enhancingPromptShots, setEnhancingPromptShots] = useState<Set<string>>(new Set());
  const videoGenerationRuns = useRef<GenerationRunMap>({});
  const inFlightVideoShots = useRef(new Set<string>());
  const [pendingVideoShots, setPendingVideoShots] = useState<Set<string>>(new Set());

  useAgentChanges(loadData);

  const loadRequest = useRef(0);
  // Load storyboard and shots on mount
  useEffect(() => {
    if (id) loadData();
    return () => { loadRequest.current++; };
  }, [id]);

  useUnsavedWork("draft", Object.keys(videoSettingsDrafts).length > 0, videoSettingsDrafts);
  useUnsavedWork("draft", isModalOpen && !!imagePrompt, imagePrompt);
  useUnsavedWork("draft", editModalState.isOpen && !!editPrompt, editPrompt);

  async function loadData() {
    if (!id) return;
    const request = ++loadRequest.current;
    setIsLoading(true);
    setLoadError(null);
    try {
      const [storyboardData, shotsData] = await Promise.all([
        getStoryboard(id),
        getShots(id),
      ]);

      if (request !== loadRequest.current) return;

      if (!storyboardData) {
        setLoadError("This storyboard is unavailable. Retry loading or return to the project.");
        return;
      }

      setStoryboard(storyboardData);
      const mappedShots = shotsData.map(shotFromShotWithUrls);
      setShots(mappedShots);
      setSelectedShotId((current) => mappedShots.some((shot) => shot.id === current) ? current : mappedShots[0]?.id ?? null);
      setDefaultImageModel((storyboardData.image_model as ImageModelId) || DEFAULT_STORYBOARD_MODELS.image_model);
      const loadedVideoModel: VideoModelId = videoModels.some((m) => m.id === storyboardData.video_model)
        ? (storyboardData.video_model as VideoModelId)
        : "seedance-2-fal";
      setDefaultVideoModel(loadedVideoModel);
      for (const [shotId, pending] of videoSettingsRequests.current) {
        if (!mappedShots.some((shot) => shot.id === shotId && (shot.video_model ?? loadedVideoModel) === pending.modelId)) videoSettingsRequests.current.delete(shotId);
      }
      setSavingVideoSettingsShots((previous) => new Set([...previous].filter((shotId) => videoSettingsRequests.current.has(shotId))));
      setVideoSettingsDrafts((previous) => {
        const matching = Object.entries(previous).filter(([shotId, draft]) =>
          mappedShots.some((shot) => shot.id === shotId && (shot.video_model ?? loadedVideoModel) === draft.model_id),
        );
        return matching.length === Object.keys(previous).length ? previous : Object.fromEntries(matching);
      });

      await loadBibleData(storyboardData);

      // Load version data for each shot
      await loadVersionDataForShots(mappedShots);
    } catch (error) {
      if (request !== loadRequest.current) return;
      setLoadError(error instanceof Error ? error.message : "Could not load the storyboard. Try again.");
    } finally {
      if (request === loadRequest.current) setIsLoading(false);
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

  async function handleStoryboardSettingsSave(values: StoryboardSettingsValues): Promise<Result<null>> {
    if (!id) return {ok:false,error:{code:"NOT_FOUND",message:"The storyboard no longer exists."}};
    setModelSaving(true);
    try {
      const result = await updateStoryboardSettings(id, values.name, values.image_model, values.video_model);
      if (!result.ok) return result;
      setStoryboard(result.value);
      setDefaultImageModel(result.value.image_model);
      setDefaultVideoModel(result.value.video_model);
      window.dispatchEvent(new Event("showbiz:project-changed"));
      return {ok:true,value:null};
    } finally {setModelSaving(false);}
  }

  async function handleShotModels(shotId: string, models: Partial<ShotModelOverrides>) {
    setModelSaving(true); setModelError(null);
    try {
      const result = await setShotModels(shotId, models);
      if (!result.ok) { setModelError(result.error.message); return; }
      setShots(previous => previous.map(shot => shot.id === shotId ? {...shot,...result.value} : shot));
    } catch (cause) { setModelError(String(cause)); }
    finally { setModelSaving(false); }
  }

  async function handleVideoSettingsChange(settings: VideoGenerationSettings) {
    if (!selectedShot || !currentVideoModel) return;
    const shotId = selectedShot.id;
    if (videoSettingsRequests.current.has(shotId)) return;
    const modelId = currentVideoModel.id;
    const token = Symbol(shotId);
    videoSettingsRequests.current.set(shotId, { token, modelId });
    setVideoSettingsDrafts((previous) => ({ ...previous, [shotId]: { model_id: modelId, settings, error: null } }));
    setSavingVideoSettingsShots((previous) => new Set(previous).add(shotId));
    try {
      const result = await setShotVideoSettings(shotId, storeShotVideoSettings(modelId, settings));
      if (videoSettingsRequests.current.get(shotId)?.token !== token) return;
      if (!result.ok) {
        setVideoSettingsDrafts((previous) => ({ ...previous, [shotId]: { model_id: modelId, settings, error: result.error.message } }));
        return;
      }
      setShots((previous) => previous.map((shot) => shot.id === shotId ? { ...shot, video_settings_json: JSON.stringify(result.value) } : shot));
      setVideoSettingsDrafts((previous) => { const next = { ...previous }; delete next[shotId]; return next; });
    } catch (cause) {
      if (videoSettingsRequests.current.get(shotId)?.token === token) setVideoSettingsDrafts((previous) => ({ ...previous, [shotId]: { model_id: modelId, settings, error: cause instanceof Error ? cause.message : "Could not save video settings. Try again." } }));
    } finally {
      if (videoSettingsRequests.current.get(shotId)?.token === token) {
        videoSettingsRequests.current.delete(shotId);
        setSavingVideoSettingsShots((previous) => { const next = new Set(previous); next.delete(shotId); return next; });
      }
    }
  }
  function discardVideoSettings() {
    if(!selectedShot || videoSettingsSaving) return;
    setVideoSettingsDrafts((previous)=>{const next={...previous};delete next[selectedShot.id];return next;});
  }

  // --- Shot Actions ---

  async function handleAddShot() {
    if (!id) return;
    try {
      const newShotData = await createShot(id);
      const newShot = shotFromShotWithUrls(newShotData);
      setShots((prev) => [...prev, newShot]);
      // Select the new shot and load ITS (empty) version data, so the inspector
      // shows the new shot - not the previously selected shot's versions.
      setSelectedShotId(newShot.id);
      await refreshVersionData(newShot.id);
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

  async function handleDeleteShot(shotId: string): Promise<Result<null>> {
    if(inFlightVideoShots.current.has(shotId)) return {ok:false,error:{code:"INVALID_INPUT",message:"Wait for this shot's current request to finish before deleting it."}};
    try {
      const deleted=await deleteShot(shotId);
      if(!deleted) return {ok:false,error:{code:"NOT_FOUND",message:"The shot could not be deleted. Refresh the project or try again."}};
      const index=shots.findIndex((shot)=>shot.id===shotId);
      setSelectedShotId((current)=>current===shotId ? shots[index+1]?.id ?? shots[index-1]?.id ?? null : current);
      setShots((previous)=>previous.filter((shot)=>shot.id!==shotId).map((shot,position)=>({...shot,order:position+1})));
      setVideoSettingsDrafts((previous)=>{const next={...previous};delete next[shotId];return next;});
      return {ok:true,value:null};
    } catch {return {ok:false,error:{code:"IO_ERROR",message:"Could not confirm deletion. The shot is still listed; try again."}};}
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
    if (!id || !activeShotId || !imagePrompt.trim()) return;
    if (isLoading || loadError) { setImageGenerationError("Reload the storyboard before generating."); return; }
    if (modelSaving) { setImageGenerationError("Wait for the model change to finish."); return; }
    if (!shots.some((shot) => shot.id === activeShotId)) { setImageGenerationError("This shot no longer exists."); return; }
    setImageGenerationError(null);
    setIsGeneratingImage(true);
    try {
      await withApplicationWork("generation", async () => {
        const targetModel = resolveShotModels(shots.find(shot => shot.id === activeShotId), defaultModels).image_model as ImageModelId;
        const imageDataUrl = await generateImageAction(imagePrompt, targetModel, {project_id: storyboard?.project_id, subject_id: activeShotId});

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
      });
    } catch (error) {
      console.error("Image generation failed", error);
      setImageGenerationError(error instanceof Error ? error.message : "Could not generate this image. Try again.");
    } finally {
      setIsGeneratingImage(false);
    }
  }

  async function changeFrame(shotId: string, role: ShotFrameRole, operation: ()=>Promise<Result<null>>) {
    setFrameErrors((previous)=>{const next={...previous};delete next[shotId];return next;});
    setSavingFrameShots((previous)=>new Set(previous).add(shotId));
    try {
      const result=await withApplicationWork("saving",operation);
      if(!result.ok) setFrameErrors((previous)=>({...previous,[shotId]:{role,message:result.error.message}}));
    } catch {setFrameErrors((previous)=>({...previous,[shotId]:{role,message:"The frame change was not saved. Choose or upload it again, or keep the current frames."}}));}
    finally {setSavingFrameShots((previous)=>{const next=new Set(previous);next.delete(shotId);return next;});}
  }
  async function handleUploadFrame(shotId: string, role: ShotFrameRole, file: File) {
    if (!id) return;
    await changeFrame(shotId,role,async()=>{
      const dataUrl=await blobToBase64(file);
      await setShotFrameFromDataUrl(shotId,role,dataUrl);
      return {ok:true,value:null};
    });
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

  async function handleClearStartFrame(shotId: string) {
    await changeFrame(shotId,"start",async()=>{
      const result=await clearShotStartFrame(shotId);
      if(!result.ok) return result;
      setShots((previous)=>previous.map((shot)=>shot.id===shotId?{...shot,image_url:null}:shot));
      await refreshVersionData(shotId);
      return {ok:true,value:null};
    });
  }
  async function handleClearEndFrame(shotId: string) {
    if (!id) return;
    await changeFrame(shotId,"end",async()=>{
      const shot=await clearShotEndFrame(shotId);
      if(!shot) return {ok:false,error:{code:"NOT_FOUND",message:"The shot no longer exists."}};
      setShots((previous)=>previous.map((current)=>current.id===shotId?shotFromShotWithUrls(shot):current));
      return {ok:true,value:null};
    });
  }
  async function handlePickFrame(shotId: string, role: ShotFrameRole, variantId: string) {
    if (!id) return;
    await changeFrame(shotId,role,async()=>{
      const dataUrl=await getBibleVariantImageBase64(variantId);
      if(!dataUrl) return {ok:false,error:{code:"INVALID_INPUT",message:"That Bible frame has no image. Choose another frame or create one in the Bible."}};
      await setShotFrameFromDataUrl(shotId,role,dataUrl);
      return {ok:true,value:null};
    });
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
    setImageGenerationError(null);
    setIsModalOpen(true);
  }

  async function handleOpenEditModal(shotId: string, versionId: string) {
    if (modelSaving) { setModelError("Wait for the model change to finish."); return; }
    const version = shotCurrentVersions[shotId];
    if (!version) return;
    imageEditOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    setEditModalState({
      isOpen: true,
      shotId,
      versionId,
      sourceImageUrl: version.image_url,
    });
    setEditPrompt("");
    setImageEditError(null);
  }

  async function handleEditImage() {
    if (!id) return;
    if (isLoading || loadError) { setImageEditError("Reload the storyboard before generating."); return; }
    if (modelSaving) { setImageEditError("Wait for the model change to finish."); return; }
    if (!shots.some((shot) => shot.id === editModalState.shotId)) { setImageEditError("This shot no longer exists."); return; }
    const { shotId, versionId } = editModalState;
    if (isEditingImage || !shotId || !versionId || !editPrompt.trim()) return;

    setIsEditingImage(true);
    setImageEditError(null);
    try {
      await withApplicationWork("generation", async () => {
        // Get source image as base64
        const sourceBase64 = await getVersionImageBase64(versionId);
        if (!sourceBase64) {
          throw new Error("Failed to load source image");
        }

        // Call edit image action
        const targetModel = resolveShotModels(shots.find(shot => shot.id === editModalState.shotId), defaultModels).image_model as ImageModelId;
        const resultBase64 = await editImageAction(sourceBase64, editPrompt, targetModel, {project_id: storyboard?.project_id, subject_id: shotId});

        // Create a new remix version
        await createRemixVersion(shotId, versionId, editPrompt, resultBase64);

        // Reload data
        const updatedShots = await getShots(id);
        setShots(updatedShots.map(shotFromShotWithUrls));
        await refreshVersionData(shotId);

        setEditModalState({ isOpen: false, shotId: null, versionId: null, sourceImageUrl: null });
      });
    } catch (error) {
      console.error("Image edit failed:", error);
      setImageEditError(error instanceof Error ? error.message : "Failed to edit frame. Try again.");
    } finally {
      setIsEditingImage(false);
    }
  }

  // --- Video Generation (Per-Shot) ---

  async function handleGenerateVideo(shotId: string) {
    const shot = shots.find((s) => s.id === shotId);
    if (!shot || inFlightVideoShots.current.has(shotId)) return;
    if (isLoading || loadError || modelSaving) { setModelError("Finish loading and saving model changes before generating."); return; }
    const targetModelId = resolveShotModels(shot, defaultModels).video_model as VideoModelId;
    const targetModel = videoModels.find(model => model.id === targetModelId);
    if (!targetModel) { setModelError("Choose an available video model for this shot."); return; }
    if (videoSettingsDrafts[shotId]) { setModelError("Save or discard this shot’s video settings before generating."); return; }
    const targetSettings = selectedShotId === shotId ? videoSettings : resolveShotVideoSettings(shot.video_settings_json,targetModel).settings;
    const runId = startGenerationRun(videoGenerationRuns.current, shotId);

    const prompt = shot.video_prompt?.trim() ?? "";
    if (!shot.image_url && !prompt) {
      setShots((prev) =>
        prev.map((s) =>
          s.id === shotId
            ? { ...s, status: shot.video_url ? shot.status : "failed" as const, error_message: "Add a start frame or a prompt before generating." }
            : s
        )
      );
      return;
    }

    inFlightVideoShots.current.add(shotId);
    setPendingVideoShots((previous)=>new Set(previous).add(shotId));

    setShots((prev) =>
      prev.map((s) =>
        s.id === shotId
          ? { ...s, status: "generating" as const, error_message: null }
          : s
      )
    );

    try {
      await withApplicationWork("generation", async () => {
        const startImage = shot.image_url ? await getShotImageBase64(shotId) : null;
        const supportsEndFrame = targetModel.modeCapabilities.imageToVideo?.supportsEndImage === true;
        const endImage =
          supportsEndFrame && shot.end_frame_url ? await getShotEndFrameBase64(shotId) : null;
        const mode = chooseVideoGenerationMode(targetModel.modeCapabilities, {
          hasStartImage: !!startImage,
        });
        const request: VideoGenerationRequest = {
          mode,
          prompt,
          settings: targetSettings,
          startImage,
          endImage: mode === "image-to-video" ? endImage : null,
        };
        validateVideoGenerationRequest(targetModel.modeCapabilities, request);

        const result = await generateAndSaveVideoRequestAction(shotId, targetModelId, request);
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
              ? { ...s, status: shot.video_url ? shot.status : "failed" as const, error_message: errorMessage }
              : s
          )
        );
      });
    } catch (error) {
      if (!isCurrentGenerationRun(videoGenerationRuns.current, shotId, runId)) return;
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Video generation preflight failed for shot ${shotId}:`, errorMessage);
      setShots((prev) =>
        prev.map((s) =>
          s.id === shotId
            ? { ...s, status: shot.video_url ? shot.status : "failed" as const, error_message: errorMessage }
            : s
        )
      );
    } finally {
      inFlightVideoShots.current.delete(shotId);
      setPendingVideoShots((previous)=>{const next=new Set(previous);next.delete(shotId);return next;});
      if (!isCurrentGenerationRun(videoGenerationRuns.current,shotId,runId)) {
        try {await refreshVersionData(shotId);}
        catch (error) {console.warn("Could not refresh the completed shot takes:",error);}
      }
    }
  }

  async function handleCancelVideoGeneration(shotId: string) {
    invalidateGenerationRun(videoGenerationRuns.current, shotId);
    const errorMessage = "Stopped waiting locally. The provider may still finish and charge for this request. New takes appear when it finishes.";
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
      await withApplicationWork("generation", async () => {
        // Get image as base64
        const imageBase64 = await getShotImageBase64(shotId);
        if (!imageBase64) {
          throw new Error("No image available for this shot");
        }

        // Generate prompt from image
        const generatedPrompt = await generateVideoPromptFromImage(imageBase64);

        // Update the shot with the generated prompt
        await handleUpdateShot(shotId, { video_prompt: generatedPrompt });
      });
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
    const originalPrompt = shot.video_prompt;

    // Add to loading set
    setEnhancingPromptShots((prev) => new Set(prev).add(shotId));

    try {
      await withApplicationWork("generation", async () => {
        // Enhance the existing prompt
        const enhancedPrompt = await enhanceVideoPrompt(originalPrompt);

        // Update the shot with the enhanced prompt
        await handleUpdateShot(shotId, { video_prompt: enhancedPrompt });
      });
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

  async function handleExport(format: "zip" | "sbz") {
    if (!id) return;
    setIsExporting(true);
    setExportMessage("");
    try {
      const result = await invoke<import("../../shared/result").Result<import("../../shared/storyboard-package").StoryboardPackageExport | null>>("export_storyboard_package", { storyboard_id: id, format });
      if (!result.ok) setExportMessage(result.error.message);
      else if (result.value) setExportMessage(`Exported ${result.value.media_count} media files from ${result.value.shot_count} shots.`);
    } catch (cause) {
      setExportMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setIsExporting(false);
    }
  }

  const hasMedia = shots.some((shot) => shot.image_url || shot.end_frame_url || shot.video_url);

  const refreshFeedback = (focusTarget: HTMLElement | null = null) => loadError ? (
    <div role="alert" className="border-b border-border px-4 py-2 text-xs flex flex-wrap items-center gap-2"><span>{loadError}</span><Button variant="outline" size="sm" onClick={async () => { await loadData(); if (focusTarget?.isConnected) focusTarget.focus(); }}>Retry loading storyboard</Button></div>
  ) : null;

  if (isLoading && !storyboard) {
    return (
      <div className="desktop-page">
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
    return <div className="desktop-page"><Header title="Storyboard" backHref="/" backLabel="project" />{refreshFeedback()}</div>;
  }

  return (
    <div className="desktop-page storyboard-page">
      {/* Main App Header */}
      <Header
        backHref={`/project/${storyboard.project_id}`}
        backLabel="Project"
        title={storyboard.name}
      >
        {/* Inline controls in header */}
        <div className="storyboard-workspace-actions">
          <span className="workspace-item-count">{shots.length} {shots.length === 1 ? "shot" : "shots"}</span>
          {isLoading && <span role="status" className="text-xs text-muted-foreground">Refreshing…</span>}
          <div role="group" aria-label="Storyboard view" className="storyboard-command-group">
          <StoryboardSettingsDialog name={storyboard.name} defaults={defaultModels} onSave={handleStoryboardSettingsSave} disabled={Object.keys(videoSettingsDrafts).length > 0} />
          <WorkspaceCommand ref={shotControlsToggle} label="Shot controls" aria-pressed={shotControlsOpen} aria-expanded={shotControlsOpen} aria-controls={shotControlsId} disabled={!selectedShot} onClick={() => setShotControlsOpen(!shotControlsOpen)}><PanelRight size={17} /></WorkspaceCommand>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><WorkspaceCommand label="Export…" disabled={isExporting || !hasMedia}>{isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share size={17} />}</WorkspaceCommand></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => void handleExport("zip")}>Media ZIP (.zip)</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleExport("sbz")}>Forgecut media (.sbz)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Header>



      {refreshFeedback()}
      <ConfirmDeletion restoreFocus={()=>shotDeletionFocus.current?.()} open={!!shotToDelete} onOpenChange={(open)=>{if(!open)setShotToDelete(null);}} title={`Delete shot ${shotToDelete?.order ?? ""}?`} description="This permanently deletes the shot and its image and video takes from this project. This cannot be undone." actionLabel="Delete shot" onConfirm={()=>shotToDelete ? handleDeleteShot(shotToDelete.id) : Promise.resolve({ok:false,error:{code:"NOT_FOUND",message:"The shot no longer exists."}})} />
      {inactiveVideoDraft && <div role="status" className="border-b border-border px-4 py-2 text-xs">Shot {shots.find((shot)=>shot.id===inactiveVideoDraft)?.order} has unsaved video settings. <Button variant="link" size="sm" onClick={()=>setSelectedShotId(inactiveVideoDraft)}>Return to shot {shots.find((shot)=>shot.id===inactiveVideoDraft)?.order}</Button></div>}
      {exportMessage && <p role="status" className="border-b border-border px-4 py-2 text-sm">{exportMessage}</p>}
      {(
        <StoryboardModeView inspectorTitle={selectedShot ? <><span>Shot {selectedShot.order}</span><Badge variant="secondary" className="inspector-take-status">{selectedShot.status}</Badge></> : "Shot controls"} controlsOpen={shotControlsOpen} controlsId={shotControlsId} onCloseControls={() => { setShotControlsOpen(false); shotControlsToggle.current?.focus(); }}
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
                generationPending: pendingVideoShots.has(shot.id),
              }))}
              selectedShotId={selectedShotId}
              onSelectShot={setSelectedShotId}
              onAddShot={handleAddShot}
              onMoveShot={handleMoveShot}
              onDeleteShot={(shotId,restoreFocus)=>{shotDeletionFocus.current=restoreFocus ?? null;setShotToDelete(shots.find((shot)=>shot.id===shotId) ?? null);}}
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
              imageModel={imageModels.find(model => model.id === imageModel) ?? null}
              generationCost={selectedShot && currentVideoModel ? <GenerationCost modelId={currentVideoModel.id} request={videoCostRequest} subject={{project_id: storyboard?.project_id, subject_id: selectedShot.id}} /> : null}
              frameLibraryHref={`/project/${storyboard.project_id}?view=bible&bibleTab=frames`}
              generationDisabled={isLoading || !!loadError || modelSaving || videoSettingsSaving || !!selectedVideoDraft || !!(selectedShotId && (pendingVideoShots.has(selectedShotId) || savingFrameShots.has(selectedShotId) || frameErrors[selectedShotId]))}
              frameError={selectedShotId ? frameErrors[selectedShotId] : null}
              modelSaving={modelSaving}
              frameSaving={!!(selectedShotId && savingFrameShots.has(selectedShotId))}
              onDismissFrameError={()=>{if(selectedShotId)setFrameErrors((previous)=>{const next={...previous};delete next[selectedShotId];return next;});}}
              generationPending={!!(selectedShotId && pendingVideoShots.has(selectedShotId))}
              videoSettingsSaving={videoSettingsSaving}
              videoSettingsError={selectedVideoDraft?.error ?? null}
              videoSettingsNotice={selectedVideoDraft ? (videoSettingsSaving ? "Saving settings…" : "Not saved") : storedVideoSettings.notice}
              onRetryVideoSettingsSave={() => {if(selectedVideoDraft) void handleVideoSettingsChange(selectedVideoDraft.settings);}}
              onDiscardVideoSettings={discardVideoSettings}
              modelControls={<ShotModelControls shot={selectedShot} defaults={defaultModels} onShotChange={handleShotModels} disabled={modelSaving || !!selectedVideoDraft} error={modelError}/>}
              shot={selectedShotId ? (() => {
                const s = shots.find(s => s.id === selectedShotId);
                return s ? {
                  id: s.id,
                  order: s.order,
                  image_model: s.image_model ?? null,
    video_model: s.video_model ?? null,
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
              onClearStartFrame={handleClearStartFrame}
              onGenerateVideo={handleGenerateVideo}
              onCancelVideoGeneration={handleCancelVideoGeneration}
              onUpdateShot={(shotId, updates) => handleUpdateShot(shotId, updates)}
              videoModel={currentVideoModel ?? null}
              videoSettings={videoSettings}
              onVideoSettingsChange={handleVideoSettingsChange}
              versions={versionsForShot(shotVersions, selectedShotId)}
              currentVersion={valueForShot(shotCurrentVersions, selectedShotId, null)}
              versionCount={valueForShot(shotVersionCounts, selectedShotId, 0)}
              videoVersions={versionsForShot(shotVideoVersions, selectedShotId)}
              currentVideoVersion={valueForShot(shotCurrentVideoVersions, selectedShotId, null)}
              videoVersionCount={valueForShot(shotVideoVersionCounts, selectedShotId, 0)}
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

      {/* Image Generation Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Generate Image with {imageModels.find((m) => m.id === resolveShotModels(shots.find((shot) => shot.id === activeShotId), defaultModels).image_model)?.name ?? "an available model"}
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
              ref={imagePromptInput}
              className="min-h-[100px]"
              placeholder="Describe the scene (e.g., 'Cyberpunk city street with neon rain')"
              value={imagePrompt}
              onChange={(e) => setImagePrompt(e.target.value)}
              autoFocus
            />
          </div>
          {refreshFeedback(imagePromptInput.current)}
          {imageGenerationError && <p role="alert" className="text-sm text-destructive">{imageGenerationError}</p>}
          <GenerationCost modelId={resolveShotModels(shots.find(shot => shot.id === activeShotId), defaultModels).image_model} request={{kind: "image"}} subject={{project_id: storyboard?.project_id, subject_id: activeShotId ?? undefined}} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleGenerateImage}
              disabled={isLoading || !!loadError || modelSaving || isGeneratingImage || !imagePrompt.trim() || !shots.some((shot) => shot.id === activeShotId)}
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
          if (!open && !isEditingImage) {
            setEditModalState({ isOpen: false, shotId: null, versionId: null, sourceImageUrl: null });
          }
        }}
      >
        <DialogContent className="max-w-2xl" onCloseAutoFocus={(event) => {
          if (imageEditOpener.current?.isConnected) {
            event.preventDefault();
            imageEditOpener.current.focus();
          }
        }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Edit frame for shot {shots.find(shot => shot.id === editModalState.shotId)?.order}
            </DialogTitle>
            <DialogDescription>
              Describe the changes for {imageModels.find(model => model.id === resolveShotModels(shots.find(shot => shot.id === editModalState.shotId), defaultModels).image_model)?.name}. This creates a new take and keeps the source frame.
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
                ref={editPromptInput}
                className="min-h-[80px]"
                aria-label="Frame edit prompt"
                placeholder="Describe the changes (e.g., 'Make the sky more dramatic' or 'Add fog in the background')"
                value={editPrompt}
                disabled={isEditingImage}
                onChange={(e) => {setEditPrompt(e.target.value);setImageEditError(null);}}
                autoFocus
              />
            </div>
          </div>
          {refreshFeedback(editPromptInput.current)}
          {imageEditError && <p role="alert" className="text-sm text-destructive">{imageEditError}</p>}
          <GenerationCost modelId={resolveShotModels(shots.find(shot => shot.id === editModalState.shotId), defaultModels).image_model} request={{kind: "image_edit"}} subject={{project_id: storyboard?.project_id, subject_id: editModalState.shotId ?? undefined}} />
          <DialogFooter>
            <Button
              variant="ghost"
              disabled={isEditingImage}
              onClick={() =>
                setEditModalState({ isOpen: false, shotId: null, versionId: null, sourceImageUrl: null })
              }
            >
              Cancel
            </Button>
            <Button
              onClick={handleEditImage}
              disabled={isLoading || !!loadError || modelSaving || isEditingImage || !editPrompt.trim() || !shots.some((shot) => shot.id === editModalState.shotId)}
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
