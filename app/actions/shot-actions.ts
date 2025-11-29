"use server";

import * as shotsDb from "../lib/data/shots";
import { saveImage, saveVideo, deleteMedia, getMediaUrl, getMediaPath, getImageAsBase64 } from "../lib/media";

export async function getShots(storyboardId: string) {
  const shots = shotsDb.getShotsByStoryboard(storyboardId);
  // Convert file paths to URLs for client consumption
  return shots.map((shot) => ({
    ...shot,
    image_url: shot.image_path ? getMediaUrl(shot.image_path) : null,
    video_url: shot.video_path ? getMediaUrl(shot.video_path) : null,
  }));
}

export async function getShot(id: string) {
  const shot = shotsDb.getShotById(id);
  if (!shot) return null;
  return {
    ...shot,
    image_url: shot.image_path ? getMediaUrl(shot.image_path) : null,
    video_url: shot.video_path ? getMediaUrl(shot.video_path) : null,
  };
}

export async function createShot(storyboardId: string) {
  const id = `shot-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const order = shotsDb.getNextShotOrder(storyboardId);
  const shot = shotsDb.createShot(id, storyboardId, order);
  return {
    ...shot,
    image_url: null,
    video_url: null,
  };
}

export async function updateShot(
  id: string,
  updates: {
    duration?: number;
    image_prompt?: string;
    video_prompt?: string;
    status?: shotsDb.ShotStatus;
  }
) {
  const shot = shotsDb.updateShot(id, updates);
  if (!shot) return null;
  return {
    ...shot,
    image_url: shot.image_path ? getMediaUrl(shot.image_path) : null,
    video_url: shot.video_path ? getMediaUrl(shot.video_path) : null,
  };
}

export async function saveShotImage(id: string, base64DataUrl: string, prompt: string) {
  // Delete old image if exists
  const existingShot = shotsDb.getShotById(id);
  if (existingShot?.image_path) {
    deleteMedia(existingShot.image_path);
  }

  // Save new image
  const imagePath = saveImage(id, base64DataUrl);

  // Update shot in database
  const shot = shotsDb.updateShot(id, {
    image_path: imagePath,
    image_prompt: prompt,
    // Reset video when image changes
    video_path: null,
    status: "pending",
  });

  // Delete old video if image changed
  if (existingShot?.video_path) {
    deleteMedia(existingShot.video_path);
  }

  if (!shot) return null;
  return {
    ...shot,
    image_url: getMediaUrl(imagePath),
    video_url: null,
  };
}

export async function saveShotVideo(id: string, base64DataUrl: string) {
  // Delete old video if exists
  const existingShot = shotsDb.getShotById(id);
  if (existingShot?.video_path) {
    deleteMedia(existingShot.video_path);
  }

  // Save new video
  const videoPath = saveVideo(id, base64DataUrl);

  // Update shot in database
  const shot = shotsDb.updateShot(id, {
    video_path: videoPath,
    status: "complete",
  });

  if (!shot) return null;
  return {
    ...shot,
    image_url: shot.image_path ? getMediaUrl(shot.image_path) : null,
    video_url: getMediaUrl(videoPath),
  };
}

export async function deleteShot(id: string) {
  // Delete media files first
  const shot = shotsDb.getShotById(id);
  if (shot) {
    if (shot.image_path) deleteMedia(shot.image_path);
    if (shot.video_path) deleteMedia(shot.video_path);
  }

  return shotsDb.deleteShot(id);
}

export async function reorderShots(storyboardId: string, shotIds: string[]) {
  shotsDb.reorderShots(storyboardId, shotIds);
}

export async function getShotImageBase64(shotId: string): Promise<string | null> {
  const shot = shotsDb.getShotById(shotId);
  if (!shot?.image_path) return null;
  return getImageAsBase64(shot.image_path);
}

export async function copyImageFromShot(targetShotId: string, sourceShotId: string) {
  const sourceShot = shotsDb.getShotById(sourceShotId);
  if (!sourceShot?.image_path) return null;

  // Get source image as base64
  const imageBase64 = getImageAsBase64(sourceShot.image_path);
  if (!imageBase64) return null;

  // Delete old image/video from target if exists
  const targetShot = shotsDb.getShotById(targetShotId);
  if (targetShot?.image_path) {
    deleteMedia(targetShot.image_path);
  }
  if (targetShot?.video_path) {
    deleteMedia(targetShot.video_path);
  }

  // Save the copied image
  const imagePath = saveImage(targetShotId, imageBase64);

  // Update target shot
  const updatedShot = shotsDb.updateShot(targetShotId, {
    image_path: imagePath,
    image_prompt: sourceShot.image_prompt ? `Copied from Shot #${sourceShot.order}` : null,
    video_path: null,
    status: "pending",
  });

  if (!updatedShot) return null;
  return {
    ...updatedShot,
    image_url: getMediaUrl(imagePath),
    video_url: null,
  };
}
