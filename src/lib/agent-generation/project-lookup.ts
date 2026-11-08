import { z } from "zod";
import { invoke } from "../bridge";
import { getBibleAssets, getBibles, getStoryboards } from "../backend-api";
import { agentFailure, type AgentResult } from "../../../shared/agent-generation";
import type {
  DocumentResult,
  ProjectDocumentState,
} from "../../../shared/project-document";

export async function openProjectId(): Promise<AgentResult<string>> {
  const state = await invoke<DocumentResult<ProjectDocumentState>>(
    "get_project_document_state",
  );
  if (!state.ok) return agentFailure("UNAVAILABLE", state.error.message);
  const projectId = state.value.current?.project_id;
  return projectId
    ? { ok: true, value: projectId }
    : agentFailure("UNAVAILABLE", "Open a project in Showbiz first.");
}

export async function findProjectAsset(projectId: string, assetId: string) {
  for (const bible of await getBibles(projectId)) {
    const assets = await getBibleAssets(bible.id);
    const asset = assets.find((candidate) => candidate.id === assetId);
    if (asset) return { asset, assets };
  }
  return null;
}

const shotSchema = z.object({
  id: z.string(),
  storyboard_id: z.string(),
  image_model: z.string().nullable(),
  video_model: z.string().nullable(),
  image_path: z.string().nullable(),
  end_frame_path: z.string().nullable(),
  video_prompt: z.string().nullable(),
  video_settings_json: z.string().nullable().optional(),
  updated_at: z.string(),
});
const versionNodeSchema: z.ZodType<{ version: { id: string }; children: unknown[] }> = z.object({
  version: z.object({ id: z.string() }),
  children: z.array(z.lazy(() => versionNodeSchema)),
});
export const versionIds = (nodes: unknown[]): string[] =>
  z.array(versionNodeSchema).parse(nodes).flatMap((node) => [
    node.version.id,
    ...versionIds(node.children),
  ]);

export async function findProjectShot(projectId: string, shotId: string) {
  for (const storyboard of await getStoryboards(projectId)) {
    const shots = z.array(shotSchema).parse(
      await invoke("get_shots", { storyboardId: storyboard.id }),
    );
    const shot = shots.find((candidate) => candidate.id === shotId);
    if (shot) return { shot, storyboard };
  }
  return null;
}

