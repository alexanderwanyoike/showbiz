import { expect, it, vi } from "vitest";
import { createInvokeHandler } from "../ipc";
import { testCatalog } from "../test-support/data-commands";
import { createMcpSession } from "./session";

it("saves shot video settings only for installed video models and valid durations", async () => {
  const saved = vi.fn(() => ({ ok: true, value: null }));
  const session = createMcpSession(
    createInvokeHandler({ ...testCatalog, set_shot_video_settings: saved }),
  );
  const call = (model_id: string, duration: string, request_id: string) =>
    session.call({
      tool: "set_shot_video_settings",
      args: { shot_id: "shot-1", model_id, settings: { duration }, expected_revision: 0, request_id },
    });
  expect(await call("nano-banana-2", "8s", "image-model")).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  expect(await call("local-video", "forever", "bad-duration")).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  expect(saved).not.toHaveBeenCalled();
  expect(await call("local-video", "8s", "good")).toMatchObject({ ok: true });
  expect(saved).toHaveBeenCalledWith({ shot_id: "shot-1", model_id: "local-video", settings: { duration: "8s" } });
});

it("refuses settings the chosen model cannot use, naming them, instead of saving them to be ignored", async () => {
  const saved = vi.fn(() => ({ ok: true, value: null }));
  const session = createMcpSession(
    createInvokeHandler({ ...testCatalog, set_shot_video_settings: saved }),
  );
  const call = (settings: Record<string, unknown>, request_id: string) =>
    session.call({
      tool: "set_shot_video_settings",
      args: { shot_id: "shot-1", model_id: "minimax-h3-fal", settings, expected_revision: 0, request_id },
    });
  expect(await call({ duration: "8", resolution: "768P", audio: true }, "audio")).toMatchObject({
    ok: false,
    error: { code: "INVALID_INPUT", message: expect.stringContaining("audio") },
  });
  expect(await call({ duration: "30", resolution: "1080p" }, "duration")).toMatchObject({
    ok: false,
    error: { code: "INVALID_INPUT", message: expect.stringMatching(/duration.*resolution/) },
  });
  expect(saved).not.toHaveBeenCalled();
  expect(await call({ duration: "8", resolution: "768P" }, "fits")).toMatchObject({ ok: true });
  expect(saved).toHaveBeenCalledWith({
    shot_id: "shot-1",
    model_id: "minimax-h3-fal",
    settings: { duration: "8", resolution: "768P" },
  });
});
