import { describe, expect, it, vi } from "vitest";
import { hideDefaultApplicationMenu } from "./app-menu";

describe("hideDefaultApplicationMenu", () => {
  it("suppresses Electron's default application menu", () => {
    const setApplicationMenu = vi.fn();

    hideDefaultApplicationMenu({ setApplicationMenu });

    expect(setApplicationMenu).toHaveBeenCalledWith(null);
  });
});
