import { useEffect, useLayoutEffect, useRef } from "react";
export function useAgentChanges(refresh: () => void | Promise<void>) {
  const current = useRef(refresh);
  useLayoutEffect(() => {
    current.current = refresh;
  });
  useEffect(() => {
    const changed = () => {
      void Promise.resolve(current.current()).catch((cause: unknown) =>
        console.error(
          "Could not refresh the project after an agent edit:",
          cause,
        ),
      );
    };
    window.addEventListener("showbiz:project-changed", changed);
    return () => window.removeEventListener("showbiz:project-changed", changed);
  }, []);
}
