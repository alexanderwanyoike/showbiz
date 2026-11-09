import { describe, expect, it } from "vitest";
import type { AgentQuotePlan, AgentQuoteRequest } from "../../shared/agent-generation";
import { readPlan } from "./plan-check";

const plan = (overrides: Partial<AgentQuotePlan> = {}): AgentQuotePlan => ({
  model_id: "flux-dev-fal",
  provider: "fal",
  cost_request: { kind: "image", count: 1 },
  subject: { project_id: "film", subject_id: "asset-1" },
  inputs: { prompt: "A sock puppet detective", reference_variant_ids: [] },
  estimate: { kind: "unavailable", reason: "No price" },
  ...overrides,
});
const request = (fields: Record<string, unknown>) => fields as AgentQuoteRequest;
const accepted = (ask: Record<string, unknown>, answer: unknown) => readPlan(request(ask), answer).ok;

describe("checking the window's plan against the agent's request", () => {
  it("matches each Bible operation to the kind of generation it runs", () => {
    const retake = { target: "bible_asset", operation: "retake", asset_id: "asset-1", model_id: "flux-dev-fal" };
    const composed = plan({
      cost_request: { kind: "image_compose", count: 1 },
      inputs: { prompt: "Sock again", reference_variant_ids: ["v1"] },
    });
    expect(accepted(retake, composed)).toBe(true);
    expect(accepted({ ...retake, operation: "generate", prompt: "Sock again" }, composed)).toBe(false);
    const edit = { ...retake, operation: "edit", source_variant_id: "v1", prompt: "Add a hat" };
    expect(
      accepted(edit, plan({ inputs: { prompt: "Add a hat", reference_variant_ids: [], source_variant_id: "v1" } })),
    ).toBe(false);
    expect(
      accepted(
        edit,
        plan({
          cost_request: { kind: "image_edit", count: 1 },
          inputs: { prompt: "Add a hat", reference_variant_ids: [], source_variant_id: "other" },
        }),
      ),
    ).toBe(false);
    expect(
      accepted(
        edit,
        plan({
          cost_request: { kind: "image_edit", count: 1 },
          inputs: { prompt: "Add a hat", reference_variant_ids: [], source_variant_id: "v1" },
        }),
      ),
    ).toBe(true);
  });

  it("refuses a retake whose resolved prompt is empty and a plan for another entry or model", () => {
    const retake = { target: "bible_asset", operation: "retake", asset_id: "asset-1", model_id: "flux-dev-fal" };
    expect(accepted(retake, plan({ inputs: { prompt: "", reference_variant_ids: [] } }))).toBe(false);
    expect(accepted(retake, plan({ subject: { project_id: "film", subject_id: "asset-2" } }))).toBe(false);
    expect(accepted(retake, plan({ model_id: "nano-banana-2" }))).toBe(false);
  });

  it("accepts a shot start frame planned for that shot, and refuses another shot or source take", () => {
    const shot = { target: "shot_start_frame", operation: "generate", shot_id: "shot-1", prompt: "Sock enters" };
    const shotPlan = plan({
      subject: { project_id: "film", subject_id: "shot-1" },
      inputs: { prompt: "Sock enters", reference_variant_ids: [] },
    });
    expect(accepted(shot, shotPlan)).toBe(true);
    expect(accepted(shot, { ...shotPlan, subject: { project_id: "film", subject_id: "shot-2" } })).toBe(false);
    const editPlan = {
      ...shotPlan,
      cost_request: { kind: "image_edit" as const, count: 1 },
      inputs: { prompt: "Sock enters", reference_variant_ids: [], source_take_id: "t1" },
    };
    expect(accepted({ ...shot, operation: "edit", source_take_id: "t1" }, editPlan)).toBe(true);
    expect(accepted({ ...shot, operation: "edit", source_take_id: "t2" }, editPlan)).toBe(false);
  });

  it("accepts a shot video planned as video for that shot only", () => {
    const video = { target: "shot_video", operation: "generate", shot_id: "shot-1" };
    const videoPlan = plan({
      cost_request: { kind: "video", duration: "8", resolution: "720p", mode: "image-to-video", has_end_frame: false },
      subject: { project_id: "film", subject_id: "shot-1" },
      inputs: {
        prompt: "",
        reference_variant_ids: [],
        video: { mode: "image-to-video", settings: { duration: "8" }, uses_end_frame: false, start_take_id: "t" },
      },
    });
    expect(accepted(video, videoPlan)).toBe(true);
    expect(accepted(video, { ...videoPlan, cost_request: { kind: "image", count: 1 } })).toBe(false);
    expect(accepted(video, { ...videoPlan, subject: { project_id: "film", subject_id: "shot-2" } })).toBe(false);
    expect(accepted(video, { ...videoPlan, inputs: { prompt: "", reference_variant_ids: ["v1"], video: videoPlan.inputs.video } })).toBe(false);
  });

  it("refuses an answer that is not a plan, and an estimate priced for another model", () => {
    const generate = { target: "bible_asset", operation: "generate", asset_id: "asset-1", prompt: "A sock puppet detective", model_id: "flux-dev-fal" };
    expect(readPlan(request(generate), { model_id: "flux-dev-fal" })).toMatchObject({ ok: false, error: { code: "IO_ERROR" } });
    const priced = (modelId: string) =>
      plan({
        estimate: {
          kind: "estimate",
          min_microusd: 1,
          max_microusd: 1,
          price: {
            provider: "fal",
            model_id: modelId,
            currency: "USD",
            source_kind: "provider",
            source_url: "https://fal.ai/docs",
            checked_at: "2026-11-08T09:59:00.000Z",
            rates: [{ unit: "request", microusd: 1 }],
          },
          stale: false,
          excludes_input_cost: false,
        },
      });
    expect(accepted(generate, priced("flux-dev-fal"))).toBe(true);
    expect(accepted(generate, priced("another-model"))).toBe(false);
  });
});
