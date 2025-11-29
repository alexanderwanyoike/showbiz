"use server";

import * as projectsDb from "../lib/data/projects";
import * as storyboardsDb from "../lib/data/storyboards";
import { deleteMedia } from "../lib/media";
import { getShotsByStoryboard } from "../lib/data/shots";

// ==================== Projects ====================

export async function getProjects() {
  return projectsDb.getAllProjects();
}

export async function getProject(id: string) {
  return projectsDb.getProjectById(id);
}

export async function createProject(name: string) {
  const id = `proj-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  return projectsDb.createProject(id, name);
}

export async function updateProject(id: string, name: string) {
  return projectsDb.updateProject(id, name);
}

export async function deleteProject(id: string) {
  // First, delete all media files associated with this project's storyboards and shots
  const storyboards = storyboardsDb.getStoryboardsByProject(id);
  for (const storyboard of storyboards) {
    const shots = getShotsByStoryboard(storyboard.id);
    for (const shot of shots) {
      if (shot.image_path) deleteMedia(shot.image_path);
      if (shot.video_path) deleteMedia(shot.video_path);
    }
  }

  // Delete project (cascades to storyboards and shots)
  return projectsDb.deleteProject(id);
}

// ==================== Storyboards ====================

export async function getStoryboards(projectId: string) {
  return storyboardsDb.getStoryboardsByProject(projectId);
}

export async function getStoryboard(id: string) {
  return storyboardsDb.getStoryboardById(id);
}

export async function createStoryboard(projectId: string, name: string) {
  const id = `sb-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  return storyboardsDb.createStoryboard(id, projectId, name);
}

export async function updateStoryboard(id: string, name: string) {
  return storyboardsDb.updateStoryboard(id, name);
}

export async function deleteStoryboard(id: string) {
  // First, delete all media files associated with this storyboard's shots
  const shots = getShotsByStoryboard(id);
  for (const shot of shots) {
    if (shot.image_path) deleteMedia(shot.image_path);
    if (shot.video_path) deleteMedia(shot.video_path);
  }

  // Delete storyboard (cascades to shots)
  return storyboardsDb.deleteStoryboard(id);
}
