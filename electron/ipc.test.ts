import { describe, it, expect, vi } from "vitest";
import { createInvokeHandler } from "./ipc";

describe("createInvokeHandler", () => {
  it("dispatches to the named command with its args", async () => {
    const getProjects = vi.fn().mockReturnValue([{ id: "p1" }]);
    const handler = createInvokeHandler({ get_projects: getProjects });

    const result = await handler("get_projects", { limit: 5 });

    expect(getProjects).toHaveBeenCalledWith({ limit: 5 });
    expect(result).toEqual([{ id: "p1" }]);
  });

  it("resolves async command handlers", async () => {
    const handler = createInvokeHandler({
      slow: async () => "done",
    });
    await expect(handler("slow", undefined)).resolves.toBe("done");
  });

  it("rejects unknown commands with the command name", async () => {
    const handler = createInvokeHandler({});
    await expect(handler("save_shot_image", {})).rejects.toThrow(
      /save_shot_image/
    );
  });
});
