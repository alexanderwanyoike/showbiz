"use server";

import * as versionsDb from "../lib/data/image-versions";
import * as shotsDb from "../lib/data/shots";
import {
  saveVersionImage,
  getMediaUrl,
  getImageAsBase64,
} from "../lib/media";

export type { ImageVersion, ImageVersionNode, EditType } from "../lib/data/image-versions";

export interface ImageVersionWithUrl extends versionsDb.ImageVersion {
  image_url: string;
  mask_url: string | null;
}

export interface ImageVersionNodeWithUrl {
  version: ImageVersionWithUrl;
  children: ImageVersionNodeWithUrl[];
}

function addUrlsToVersion(version: versionsDb.ImageVersion): ImageVersionWithUrl {
  return {
    ...version,
    image_url: getMediaUrl(version.image_path),
    mask_url: version.mask_path ? getMediaUrl(version.mask_path) : null,
  };
}

function addUrlsToTree(nodes: versionsDb.ImageVersionNode[]): ImageVersionNodeWithUrl[] {
  return nodes.map((node) => ({
    version: addUrlsToVersion(node.version),
    children: addUrlsToTree(node.children),
  }));
}

export async function getImageVersions(
  shotId: string
): Promise<ImageVersionNodeWithUrl[]> {
  const tree = versionsDb.getVersionTreeByShot(shotId);
  return addUrlsToTree(tree);
}

export async function getCurrentImageVersion(
  shotId: string
): Promise<ImageVersionWithUrl | null> {
  const version = versionsDb.getCurrentVersion(shotId);
  return version ? addUrlsToVersion(version) : null;
}

export async function getVersionCount(shotId: string): Promise<number> {
  return versionsDb.getVersionCount(shotId);
}

export async function switchToVersion(
  shotId: string,
  versionId: string
): Promise<ImageVersionWithUrl | null> {
  versionsDb.setCurrentVersion(shotId, versionId);
  const version = versionsDb.getVersionById(versionId);
  if (!version) return null;

  // Update shot's image_path to match the current version
  shotsDb.updateShot(shotId, {
    image_path: version.image_path,
    image_prompt: version.prompt,
    // Reset video since image changed
    video_path: null,
    status: "pending",
  });

  return addUrlsToVersion(version);
}

export async function createGenerationVersion(
  shotId: string,
  prompt: string,
  imageBase64: string,
  parentVersionId: string | null = null
): Promise<ImageVersionWithUrl> {
  const versionNumber = versionsDb.getNextVersionNumber(shotId);
  const imagePath = saveVersionImage(shotId, versionNumber, imageBase64);

  const version = versionsDb.createVersion({
    shotId,
    parentVersionId,
    editType: parentVersionId ? "regeneration" : "generation",
    imagePath,
    prompt,
    editPrompt: null,
    maskPath: null,
  });

  // Update shot's image_path to the new version
  shotsDb.updateShot(shotId, {
    image_path: imagePath,
    image_prompt: prompt,
    // Reset video since image changed
    video_path: null,
    status: "pending",
  });

  return addUrlsToVersion(version);
}

export async function createRemixVersion(
  shotId: string,
  parentVersionId: string,
  editPrompt: string,
  resultImageBase64: string
): Promise<ImageVersionWithUrl> {
  const parentVersion = versionsDb.getVersionById(parentVersionId);
  const versionNumber = versionsDb.getNextVersionNumber(shotId);
  const imagePath = saveVersionImage(shotId, versionNumber, resultImageBase64);

  const version = versionsDb.createVersion({
    shotId,
    parentVersionId,
    editType: "remix",
    imagePath,
    prompt: parentVersion?.prompt || null,
    editPrompt,
    maskPath: null,
  });

  // Update shot's image_path to the new version
  shotsDb.updateShot(shotId, {
    image_path: imagePath,
    image_prompt: editPrompt,
    video_path: null,
    status: "pending",
  });

  return addUrlsToVersion(version);
}

export async function getVersionImageBase64(
  versionId: string
): Promise<string | null> {
  const version = versionsDb.getVersionById(versionId);
  if (!version) return null;
  return getImageAsBase64(version.image_path);
}

export async function deleteVersion(versionId: string): Promise<boolean> {
  return versionsDb.deleteVersion(versionId);
}
