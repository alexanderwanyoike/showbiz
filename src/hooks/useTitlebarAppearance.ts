import { useEffect, useState, type RefObject } from "react";
import { readTitlebarColors } from "../lib/titlebar-colors";
export function useTitlebarAppearance(element: RefObject<HTMLElement | null>) {
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const apply = window.showbiz?.setTitleBarAppearance;
    if (!window.showbiz?.desktop?.customTitlebar || !apply) return;
    let active = true;
    let frame = 0;
    let last = "";
    async function sync() {
      if (!element.current) return;
      const colors = readTitlebarColors(element.current);
      if (!colors.ok) {
        setError(colors.error.message);
        return;
      }
      const key = JSON.stringify(colors.value);
      if (key === last) return;
      try {
        const result = await apply!(colors.value);
        if (!active) return;
        if (result.ok) {
          last = key;
          setError(null);
        } else setError(result.error.message);
      } catch (cause) {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Window colors could not be updated.",
          );
      }
    }
    const request = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        void sync();
      });
    };
    const observer = new MutationObserver(request);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-material", "data-accent"],
    });
    request();
    return () => {
      active = false;
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [element, revision]);
  return {
    error,
    retry: () => setRevision((value) => value + 1),
    dismiss: () => setError(null),
  };
}
