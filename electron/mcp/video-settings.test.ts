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
