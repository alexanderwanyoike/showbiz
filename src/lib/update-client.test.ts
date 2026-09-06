import { afterEach, expect, it, vi } from "vitest";
import { updateClient } from "./update-client";

afterEach(() => vi.unstubAllGlobals());

it("uses fixed snake_case updater commands with no renderer-supplied arguments", async () => {
  const invoke = vi.fn().mockResolvedValue({ state: "current" });
  vi.stubGlobal("window", { showbiz: { invoke } });
  await updateClient.getStatus();
  await updateClient.check();
  await updateClient.download();
  await updateClient.install();
  await updateClient.openRelease();
  expect(invoke.mock.calls).toEqual([
    ["get_update_status", undefined], ["check_for_updates", undefined], ["download_update", undefined],
    ["install_update", undefined], ["open_update_release", undefined],
  ]);
});

it("subscribes to status changes and returns the bridge unsubscribe", () => {
  const unsubscribe = vi.fn();
  const onUpdateStatus = vi.fn(() => unsubscribe);
  vi.stubGlobal("window", { showbiz: { onUpdateStatus } });
  const listener = vi.fn();
  expect(updateClient.subscribe(listener)).toBe(unsubscribe);
  expect(onUpdateStatus).toHaveBeenCalledWith(listener);
});
