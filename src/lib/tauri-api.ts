import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";

// Helper to convert absolute paths from Rust to asset:// URLs with cache busting
function mediaUrl(absPath: string | null): string | null {
  if (!absPath) return null;
  return convertFileSrc(absPath) + "?t=" + Date.now();
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
  video_prompt: string | null;
  video_path: string | null;
  video_url: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export type ApiKeyProvider = "gemini" | "ltx" | "kie";

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

export interface TimelineEdit {
  id: string;
  storyboard_id: string;
  shot_id: string;
  trim_in: number;
  trim_out: number;
  created_at: string;
  updated_at: string;
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

// --- Shots ---
function convertShotUrls(shot: ShotWithUrls): ShotWithUrls {
  return {
    ...shot,
    image_url: mediaUrl(shot.image_url),
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

// --- Media Helper ---
export async function getMediaBasePath(): Promise<string> {
  return invoke("get_media_path");
}

// --- Video save (used by generation-actions) ---
export async function saveAndCompleteVideo(shotId: string, videoData: number[], mimeType: string): Promise<ShotWithUrls> {
  const shot: ShotWithUrls = await invoke("save_and_complete_video", { shotId, videoData, mimeType });
  return convertShotUrls(shot);
}
