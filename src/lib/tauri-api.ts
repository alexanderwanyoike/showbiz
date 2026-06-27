import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";

// Helper to convert absolute paths from Rust to asset:// URLs with cache busting
function mediaUrl(absPath: string | null): string | null {
  if (!absPath) return null;
  return convertFileSrc(absPath) + "?t=" + Date.now();
}

// Convert an asset:// URL back to the absolute filesystem path.
// asset://localhost/%2Fhome%2F...%2Ffile.mp4?t=123 → /home/.../file.mp4
export function assetUrlToPath(assetUrl: string): string | null {
  try {
    const withoutQuery = assetUrl.split("?")[0];
    const url = new URL(withoutQuery);
    return decodeURIComponent(url.pathname.slice(1));
  } catch {
    return null;
  }
}

// --- Types ---
export interface Project {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface Storyboard {
  id: string;
  project_id: string;
  name: string;
  image_model: string;
  video_model: string;
  created_at: string;
  updated_at: string;
}

export interface StoryboardWithPreview extends Storyboard {
  preview_image_path: string | null;
}

export interface ShotWithUrls {
  id: string;
  storyboard_id: string;
  order: number;
  duration: number;
  image_prompt: string | null;
  image_path: string | null;
  image_url: string | null;
  end_frame_path: string | null;
  end_frame_url: string | null;
  video_prompt: string | null;
  video_path: string | null;
  video_url: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export type ApiKeyProvider = "gemini" | "ltx" | "kie" | "fal" | "replicate";

export interface ApiKeyStatus {
  provider: ApiKeyProvider;
  name: string;
  is_configured: boolean;
  source: string | null;
}

export interface ImageVersion {
  id: string;
  shot_id: string;
  parent_version_id: string | null;
  version_number: number;
  edit_type: string;
  image_path: string;
  prompt: string | null;
  edit_prompt: string | null;
  mask_path: string | null;
  is_current: boolean;
  created_at: string;
}

export interface ImageVersionWithUrl extends ImageVersion {
  image_url: string;
  mask_url: string | null;
}

export interface ImageVersionNode {
  version: ImageVersionWithUrl;
  children: ImageVersionNode[];
}

export interface VideoVersion {
  id: string;
  shot_id: string;
  parent_version_id: string | null;
  version_number: number;
  edit_type: string;
  video_path: string;
  prompt: string | null;
  settings_json: string | null;
  model_id: string | null;
  is_current: boolean;
  created_at: string;
}

export interface VideoVersionWithUrl extends VideoVersion {
  video_url: string;
}

export interface VideoVersionNode {
  version: VideoVersionWithUrl;
  children: VideoVersionNode[];
}

export interface TimelineEdit {
  id: string;
  storyboard_id: string;
  shot_id: string;
  trim_in: number;
  trim_out: number;
  created_at: string;
  updated_at: string;
}

export interface TimelineTrack {
  id: string;
  storyboard_id: string;
  track_id: string;
  name: string;
  track_type: "video" | "audio";
  position: number;
  created_at: string;
}

export interface TimelineClipRow {
  id: string;
  storyboard_id: string;
  shot_id: string;
  track_id: string;
  start_time: number;
  created_at: string;
}

export type BibleAssetType = "character" | "location" | "prop" | "style" | "reference" | "note";
export type BibleAssetVariantStatus = "candidate" | "approved" | "rejected";

export interface Bible {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface BibleAsset {
  id: string;
  bible_id: string;
  asset_type: BibleAssetType;
  name: string;
  summary: string | null;
  description: string | null;
  tags_json: string | null;
  rules_json: string | null;
  consent_confirmed: boolean;
  status: "draft" | "approved" | "archived";
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface BibleAssetInput {
  asset_type: BibleAssetType;
  name: string;
  summary?: string | null;
  description?: string | null;
  tags_json?: string | null;
  rules_json?: string | null;
  consent_confirmed: boolean;
}

export interface BibleAssetVariant {
  id: string;
  asset_id: string;
  parent_variant_id: string | null;
  name: string | null;
  status: BibleAssetVariantStatus;
  media_path: string | null;
  media_url: string | null;
  prompt: string | null;
  negative_prompt: string | null;
  model_id: string | null;
  source_kind: "uploaded" | "generated" | "edited" | "imported";
  is_primary: boolean;
  created_at: string;
}

export interface BibleAssetVariantInput {
  parent_variant_id?: string | null;
  name?: string | null;
  status?: BibleAssetVariantStatus | null;
  image_base64?: string | null;
  prompt?: string | null;
  negative_prompt?: string | null;
  model_id?: string | null;
  source_kind: "uploaded" | "generated" | "edited" | "imported";
  is_primary: boolean;
}

// --- Projects ---
export async function getProjects(): Promise<Project[]> {
  return invoke("get_projects");
}

export async function getProject(id: string): Promise<Project | null> {
  return invoke("get_project", { id });
}

export async function createProject(name: string): Promise<Project> {
  return invoke("create_project", { name });
}

export async function updateProject(id: string, name: string): Promise<Project> {
  return invoke("update_project", { id, name });
}

export async function deleteProject(id: string): Promise<boolean> {
  return invoke("delete_project", { id });
}

// --- Storyboards ---
export async function getStoryboards(projectId: string): Promise<Storyboard[]> {
  return invoke("get_storyboards", { projectId });
}

export async function getStoryboardsWithPreview(projectId: string): Promise<StoryboardWithPreview[]> {
  const results: StoryboardWithPreview[] = await invoke("get_storyboards_with_preview", { projectId });
  // Convert preview paths to URLs
  return results.map(s => ({
    ...s,
    preview_image_path: s.preview_image_path ? mediaUrl(s.preview_image_path) : null,
  }));
}

export async function getStoryboard(id: string): Promise<Storyboard | null> {
  return invoke("get_storyboard", { id });
}

export async function createStoryboard(projectId: string, name: string): Promise<Storyboard> {
  return invoke("create_storyboard", { projectId, name });
}

export async function updateStoryboard(id: string, name: string): Promise<Storyboard> {
  return invoke("update_storyboard", { id, name });
}

export async function deleteStoryboard(id: string): Promise<boolean> {
  return invoke("delete_storyboard", { id });
}

export async function updateStoryboardModels(id: string, imageModel: string, videoModel: string): Promise<Storyboard> {
  return invoke("update_storyboard_models", { id, imageModel, videoModel });
}

// --- Bibles ---
function convertBibleVariantUrls(variant: BibleAssetVariant): BibleAssetVariant {
  return {
    ...variant,
    media_url: mediaUrl(variant.media_url),
  };
}

export async function getBibles(projectId: string): Promise<Bible[]> {
  return invoke("get_bibles", { projectId });
}

export async function createBible(projectId: string, name: string, description?: string | null): Promise<Bible> {
  return invoke("create_bible", { projectId, name, description: description ?? null });
}

export async function updateBible(id: string, name: string, description?: string | null): Promise<Bible> {
  return invoke("update_bible", { id, name, description: description ?? null });
}

export async function deleteBible(id: string): Promise<boolean> {
  return invoke("delete_bible", { id });
}

export async function getBibleAssets(bibleId: string): Promise<BibleAsset[]> {
  return invoke("get_bible_assets", { bibleId });
}

export async function createBibleAsset(bibleId: string, input: BibleAssetInput): Promise<BibleAsset> {
  return invoke("create_bible_asset", { bibleId, input });
}

export async function updateBibleAsset(id: string, input: BibleAssetInput): Promise<BibleAsset> {
  return invoke("update_bible_asset", { id, input });
}

export async function deleteBibleAsset(id: string): Promise<boolean> {
  return invoke("delete_bible_asset", { id });
}

export async function getBibleAssetVariants(assetId: string): Promise<BibleAssetVariant[]> {
  const variants: BibleAssetVariant[] = await invoke("get_bible_asset_variants", { assetId });
  return variants.map(convertBibleVariantUrls);
}

export async function createBibleAssetVariant(assetId: string, input: BibleAssetVariantInput): Promise<BibleAssetVariant> {
  const variant: BibleAssetVariant = await invoke("create_bible_asset_variant", { assetId, input });
  return convertBibleVariantUrls(variant);
}

export async function updateBibleAssetVariantStatus(
  id: string,
  status: BibleAssetVariantStatus,
  isPrimary: boolean
): Promise<BibleAssetVariant> {
  const variant: BibleAssetVariant = await invoke("update_bible_asset_variant_status", { id, status, isPrimary });
  return convertBibleVariantUrls(variant);
}

export async function deleteBibleAssetVariant(id: string): Promise<boolean> {
  return invoke("delete_bible_asset_variant", { id });
}

export async function getBibleVariantImageBase64(variantId: string): Promise<string | null> {
  return invoke("get_bible_variant_image_base64", { variantId });
}

// --- Shots ---
function convertShotUrls(shot: ShotWithUrls): ShotWithUrls {
  return {
    ...shot,
    image_url: mediaUrl(shot.image_url),
    end_frame_url: mediaUrl(shot.end_frame_url),
    video_url: mediaUrl(shot.video_url),
  };
}

export async function getShots(storyboardId: string): Promise<ShotWithUrls[]> {
  const shots: ShotWithUrls[] = await invoke("get_shots", { storyboardId });
  return shots.map(convertShotUrls);
}

export async function createShot(storyboardId: string): Promise<ShotWithUrls> {
  const shot: ShotWithUrls = await invoke("create_shot", { storyboardId });
  return convertShotUrls(shot);
}

export async function updateShot(id: string, updates: Record<string, unknown>): Promise<ShotWithUrls | null> {
  const shot: ShotWithUrls | null = await invoke("update_shot", { id, updatesJson: JSON.stringify(updates) });
  return shot ? convertShotUrls(shot) : null;
}

export async function deleteShot(id: string): Promise<boolean> {
  return invoke("delete_shot", { id });
}

export async function reorderShots(storyboardId: string, shotIds: string[]): Promise<void> {
  return invoke("reorder_shots", { storyboardId, shotIds });
}

export async function saveShotImage(id: string, base64DataUrl: string, prompt: string): Promise<ShotWithUrls | null> {
  const shot: ShotWithUrls | null = await invoke("save_shot_image", { id, base64DataUrl, prompt });
  return shot ? convertShotUrls(shot) : null;
}

export async function saveShotVideo(id: string, base64DataUrl: string): Promise<ShotWithUrls | null> {
  const shot: ShotWithUrls | null = await invoke("save_shot_video", { id, base64DataUrl });
  return shot ? convertShotUrls(shot) : null;
}

export async function getShotImageBase64(shotId: string): Promise<string | null> {
  return invoke("get_shot_image_base64", { shotId });
}

export async function saveShotEndFrame(id: string, base64DataUrl: string): Promise<ShotWithUrls | null> {
  const shot: ShotWithUrls | null = await invoke("save_shot_end_frame", { id, base64DataUrl });
  return shot ? convertShotUrls(shot) : null;
}

export async function clearShotEndFrame(id: string): Promise<ShotWithUrls | null> {
  const shot: ShotWithUrls | null = await invoke("clear_shot_end_frame", { id });
  return shot ? convertShotUrls(shot) : null;
}

export async function getShotEndFrameBase64(shotId: string): Promise<string | null> {
  return invoke("get_shot_end_frame_base64", { shotId });
}

export async function copyImageFromShot(targetShotId: string, sourceShotId: string): Promise<ShotWithUrls | null> {
  const shot: ShotWithUrls | null = await invoke("copy_image_from_shot", { targetShotId, sourceShotId });
  return shot ? convertShotUrls(shot) : null;
}

// --- Settings ---
export async function getApiKeyStatusAction(): Promise<ApiKeyStatus[]> {
  return invoke("get_api_key_status");
}

export async function saveApiKeyAction(provider: ApiKeyProvider, apiKey: string): Promise<{ success: boolean; error?: string }> {
  try {
    await invoke("save_api_key", { provider, apiKey });
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function deleteApiKeyAction(provider: ApiKeyProvider): Promise<{ success: boolean; error?: string }> {
  try {
    await invoke("delete_api_key", { provider });
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function getApiKey(provider: string): Promise<string | null> {
  return invoke("get_api_key", { provider });
}

// --- Image Versions ---
function convertVersionUrls(node: ImageVersionNode): ImageVersionNode {
  return {
    version: {
      ...node.version,
      image_url: mediaUrl(node.version.image_url) || node.version.image_url,
      mask_url: node.version.mask_url ? mediaUrl(node.version.mask_url) : null,
    },
    children: node.children.map(convertVersionUrls),
  };
}

export async function getImageVersions(shotId: string): Promise<ImageVersionNode[]> {
  const nodes: ImageVersionNode[] = await invoke("get_image_versions", { shotId });
  return nodes.map(convertVersionUrls);
}

export async function switchToVersion(shotId: string, versionId: string): Promise<ImageVersionWithUrl | null> {
  const ver: ImageVersionWithUrl | null = await invoke("switch_to_version", { shotId, versionId });
  if (!ver) return null;
  return { ...ver, image_url: mediaUrl(ver.image_url) || ver.image_url, mask_url: ver.mask_url ? mediaUrl(ver.mask_url) : null };
}

export async function createGenerationVersion(shotId: string, prompt: string, imageBase64: string, parentVersionId: string | null): Promise<ImageVersionWithUrl> {
  const ver: ImageVersionWithUrl = await invoke("create_generation_version", { shotId, prompt, imageBase64, parentVersionId });
  return { ...ver, image_url: mediaUrl(ver.image_url) || ver.image_url, mask_url: ver.mask_url ? mediaUrl(ver.mask_url) : null };
}

export async function createRemixVersion(shotId: string, parentVersionId: string, editPrompt: string, resultImageBase64: string): Promise<ImageVersionWithUrl> {
  const ver: ImageVersionWithUrl = await invoke("create_remix_version", { shotId, parentVersionId, editPrompt, resultImageBase64 });
  return { ...ver, image_url: mediaUrl(ver.image_url) || ver.image_url, mask_url: ver.mask_url ? mediaUrl(ver.mask_url) : null };
}

export async function getVersionImageBase64(versionId: string): Promise<string | null> {
  return invoke("get_version_image_base64", { versionId });
}

export async function deleteVersion(versionId: string): Promise<boolean> {
  return invoke("delete_version", { versionId });
}

export async function getVersionCount(shotId: string): Promise<number> {
  return invoke("get_version_count", { shotId });
}

export async function getCurrentImageVersion(shotId: string): Promise<ImageVersionWithUrl | null> {
  // We can derive this from getImageVersions by finding the current one
  const versions = await getImageVersions(shotId);
  function findCurrent(nodes: ImageVersionNode[]): ImageVersionWithUrl | null {
    for (const node of nodes) {
      if (node.version.is_current) return node.version;
      const found = findCurrent(node.children);
      if (found) return found;
    }
    return null;
  }
  return findCurrent(versions);
}

// --- Video Versions ---
function convertVideoVersionUrls(node: VideoVersionNode): VideoVersionNode {
  return {
    version: {
      ...node.version,
      video_url: mediaUrl(node.version.video_url) || node.version.video_url,
    },
    children: node.children.map(convertVideoVersionUrls),
  };
}

export async function getVideoVersions(shotId: string): Promise<VideoVersionNode[]> {
  const nodes: VideoVersionNode[] = await invoke("get_video_versions", { shotId });
  return nodes.map(convertVideoVersionUrls);
}

export async function getCurrentVideoVersion(shotId: string): Promise<VideoVersionWithUrl | null> {
  const ver: VideoVersionWithUrl | null = await invoke("get_current_video_version", { shotId });
  if (!ver) return null;
  return { ...ver, video_url: mediaUrl(ver.video_url) || ver.video_url };
}

export async function switchToVideoVersion(shotId: string, versionId: string): Promise<VideoVersionWithUrl | null> {
  const ver: VideoVersionWithUrl | null = await invoke("switch_to_video_version", { shotId, versionId });
  if (!ver) return null;
  return { ...ver, video_url: mediaUrl(ver.video_url) || ver.video_url };
}

export async function getVideoVersionCount(shotId: string): Promise<number> {
  return invoke("get_video_version_count", { shotId });
}

export async function createVideoGenerationVersion(
  shotId: string,
  videoData: number[],
  mimeType: string,
  prompt: string | null,
  settingsJson: string | null,
  modelId: string | null,
  parentVersionId: string | null
): Promise<VideoVersionWithUrl> {
  const ver: VideoVersionWithUrl = await invoke("create_video_generation_version", {
    shotId,
    videoData,
    mimeType,
    prompt,
    settingsJson,
    modelId,
    parentVersionId,
  });
  return { ...ver, video_url: mediaUrl(ver.video_url) || ver.video_url };
}

// --- Timeline ---
export async function getTimelineEdits(storyboardId: string): Promise<TimelineEdit[]> {
  return invoke("get_timeline_edits", { storyboardId });
}

export async function updateTimelineEdit(storyboardId: string, shotId: string, trimIn: number, trimOut: number): Promise<TimelineEdit> {
  return invoke("update_timeline_edit", { storyboardId, shotId, trimIn, trimOut });
}

export async function resetTimelineEdit(shotId: string): Promise<boolean> {
  return invoke("reset_timeline_edit", { shotId });
}

export async function resetAllTimelineEdits(storyboardId: string): Promise<boolean> {
  return invoke("reset_all_timeline_edits", { storyboardId });
}

// --- Timeline Tracks ---
export async function getTimelineTracks(storyboardId: string): Promise<TimelineTrack[]> {
  return invoke("get_timeline_tracks", { storyboardId });
}

export async function createTimelineTrack(storyboardId: string, trackType: string): Promise<TimelineTrack> {
  return invoke("create_timeline_track", { storyboardId, trackType });
}

export async function deleteTimelineTrack(id: string): Promise<boolean> {
  return invoke("delete_timeline_track", { id });
}

export async function ensureDefaultTracks(storyboardId: string): Promise<TimelineTrack[]> {
  return invoke("ensure_default_tracks", { storyboardId });
}

// --- Timeline Clips ---
export async function getTimelineClips(storyboardId: string): Promise<TimelineClipRow[]> {
  return invoke("get_timeline_clips", { storyboardId });
}

export async function addTimelineClip(storyboardId: string, shotId: string, trackId: string, startTime: number): Promise<TimelineClipRow> {
  return invoke("add_timeline_clip", { storyboardId, shotId, trackId, startTime });
}

export async function removeTimelineClip(id: string): Promise<boolean> {
  return invoke("remove_timeline_clip", { id });
}

export async function removeAllTimelineClips(storyboardId: string): Promise<boolean> {
  return invoke("remove_all_timeline_clips", { storyboardId });
}

export async function moveTimelineClip(clipId: string, targetTrackId: string, startTime: number): Promise<void> {
  return invoke("move_timeline_clip", { clipId, targetTrackId, startTime });
}

// --- Media Helper ---
export async function getMediaBasePath(): Promise<string> {
  return invoke("get_media_path");
}

// --- Assembled Video Export ---
export async function saveAssembledVideo(videoData: number[], savePath: string): Promise<void> {
  return invoke("save_assembled_video", { videoData, savePath });
}

// --- Video save (used by generation-actions) ---
export async function saveAndCompleteVideo(shotId: string, videoData: number[], mimeType: string): Promise<ShotWithUrls> {
  const shot: ShotWithUrls = await invoke("save_and_complete_video", { shotId, videoData, mimeType });
  return convertShotUrls(shot);
}
