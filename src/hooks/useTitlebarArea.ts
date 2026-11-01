import { useEffect, useState, type CSSProperties } from "react";
interface ControlsOverlay extends EventTarget {
  visible: boolean;
  getTitlebarAreaRect(): Pick<DOMRect, "x" | "right">;
}
export function useTitlebarArea(): CSSProperties | undefined {
  const overlay = (navigator as Navigator & { windowControlsOverlay?: ControlsOverlay }).windowControlsOverlay;
  const read = () => {
    if (!window.showbiz?.desktop?.customTitlebar || !overlay) return undefined;
    if (!overlay.visible) return { paddingLeft: 12, paddingRight: 12 };
    const area = overlay.getTitlebarAreaRect();
    return { paddingLeft: Math.max(12, area.x + 12), paddingRight: Math.max(12, window.innerWidth - area.right + 8) };
  };
  const [style, setStyle] = useState(read);
  useEffect(() => {
    const sync = () => setStyle(read());
    overlay?.addEventListener("geometrychange", sync);
    window.addEventListener("resize", sync);
    return () => { overlay?.removeEventListener("geometrychange", sync); window.removeEventListener("resize", sync); };
  }, [overlay]);
  return style;
}
