import type { Result } from "../../shared/result";
import type { DesktopTitleBarAppearance } from "../../shared/desktop-shell";
export function readTitlebarColors(element: HTMLElement): Result<DesktopTitleBarAppearance> {
  try {
    const canvas = document.createElement("canvas"); canvas.width = 1; canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return { ok: false, error: { code: "IO_ERROR", message: "Window colors could not be resolved." } };
    const hex = (color: string) => { context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1); const rgba = context.getImageData(0, 0, 1, 1).data; if (rgba[3] !== 255) throw new Error("Window colors must be opaque."); return `#${[rgba[0], rgba[1], rgba[2]].map((part) => part.toString(16).padStart(2, "0")).join("")}`; };
    const style = getComputedStyle(element);
    return { ok: true, value: { color: hex(style.backgroundColor), symbolColor: hex(style.color) } };
  } catch (cause) { return { ok: false, error: { code: "IO_ERROR", message: cause instanceof Error ? cause.message : "Window colors could not be resolved." } }; }
}
