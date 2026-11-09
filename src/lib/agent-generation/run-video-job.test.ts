import { expect, it, vi } from "vitest";
import type { AgentJobStart } from "../../../shared/agent-generation";
import { runAgentJob } from "./run-job";
import { digestOf } from "../shot-video";

const actions = vi.hoisted(() => ({ generateAndSaveVideoRequestAction: vi.fn() }));
vi.mock("../../actions/generation-actions", async (original) => ({
  ...(await original<typeof import("../../actions/generation-actions")>()),
  generateAndSaveVideoRequestAction: actions.generateAndSaveVideoRequestAction,
}));
vi.mock("../backend-api", async (original) => ({
  ...(await original<typeof import("../backend-api")>()),
  getShotImageBase64: async () => "data:image/png;base64,START",
  getShotEndFrameBase64: async () => "data:image/png;base64,END",
  getCurrentImageVersion: async () => ({ id: "start-take-1" }),
}));

const settings = { duration: "8", resolution: "720p", aspectRatio: "16:9", audio: true };
const END_DIGEST = "1f1f8d0b8a5b4e0f62d24e4a4a2d7a5e7f9d07e37a5b5f6f15f3d8c1b0e2a9d3";
const estimate = {
  kind: "estimate" as const,
  min_microusd: 400_000,
  max_microusd: 400_000,
  price: {
    provider: "fal",
    model_id: "seedance-2-fal",
    currency: "USD" as const,
    source_url: "https://fal.ai",
    checked_at: "2026-11-08T10:00:00.000Z",
    rates: [{ unit: "second" as const, microusd: 50_000 }],
  },
  stale: false,
  excludes_input_cost: false,
};
const job: AgentJobStart = {
  job_id: "job-video",
  usage_request_id: "usage-video",
  request: { target: "shot_video", operation: "generate", shot_id: "shot-1" },
  plan: {
    model_id: "seedance-2-fal",
    provider: "fal",
    cost_request: { kind: "video", duration: "8", resolution: "720p", audio: true, aspect_ratio: "16:9", mode: "image-to-video", has_end_frame: true },
    subject: { project_id: "film", subject_id: "shot-1" },
    inputs: {
      prompt: "He pushes the door open",
      reference_variant_ids: [],
      video: { mode: "image-to-video", settings, uses_end_frame: true, start_take_id: "start-take-1", end_frame_digest: END_DIGEST },
    },
    estimate,
  },
};

async function withRealDigest(start: AgentJobStart): Promise<AgentJobStart> {
  const video = start.plan.inputs.video;
  if (!video) throw new Error("expected video");
  return {
    ...start,
    plan: {
      ...start.plan,
      inputs: { ...start.plan.inputs, video: { ...video, end_frame_digest: await digestOf("data:image/png;base64,END") } },
    },
  };
}

it("refuses to run when the frames changed after planning, and tells the agent to generate again", async () => {
  actions.generateAndSaveVideoRequestAction.mockReset();
  const report = vi.fn(async () => undefined);
  await runAgentJob(job, report);
  expect(report).toHaveBeenLastCalledWith(expect.objectContaining({ status: "failed" }));
  const quotedTake = await withRealDigest(job);
  await runAgentJob(
    { ...quotedTake, plan: { ...quotedTake.plan, inputs: { ...quotedTake.plan.inputs, video: { ...quotedTake.plan.inputs.video!, start_take_id: "older-take" } } } },
    report,
  );
  expect(report).toHaveBeenLastCalledWith(
    expect.objectContaining({
      status: "failed",
      error: "The shot's frames changed after planning. Call generate again with a new request_id.",
    }),
  );
  expect(actions.generateAndSaveVideoRequestAction).not.toHaveBeenCalled();
});

it("runs a shot video job through the storyboard's video action with the quoted request", async () => {
  actions.generateAndSaveVideoRequestAction.mockResolvedValue({ success: true, videoUrl: "blob:video", versionId: "video-take-2" });
  const report = vi.fn(async () => undefined);
  await runAgentJob(await withRealDigest(job), report);
  expect(actions.generateAndSaveVideoRequestAction).toHaveBeenCalledWith(
    "shot-1",
    "seedance-2-fal",
    {
      mode: "image-to-video",
      prompt: "He pushes the door open",
      settings,
      startImage: "data:image/png;base64,START",
      endImage: "data:image/png;base64,END",
    },
    { request_id: "usage-video", agent_job_id: "job-video", estimate },
  );
  expect(report).toHaveBeenLastCalledWith({
    job_id: "job-video",
    status: "completed",
    result: { video_take_id: "video-take-2" },
    warnings: [],
  });
});

it("reports the video action's failure", async () => {
  actions.generateAndSaveVideoRequestAction.mockResolvedValue({ success: false, videoUrl: null, error: "Provider refused" });
  const report = vi.fn(async () => undefined);
  await runAgentJob(await withRealDigest(job), report);
  expect(report).toHaveBeenLastCalledWith({ job_id: "job-video", status: "failed", error: "Provider refused" });
});
