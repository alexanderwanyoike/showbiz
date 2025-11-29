import { useState, useCallback, useRef, useEffect } from "react";

interface TrimState {
  shotId: string;
  edge: "in" | "out";
  initialValue: number;
  initialMouseX: number;
}

interface UseTrimDragOptions {
  pixelsPerSecond: number;
  onTrimChange: (shotId: string, trimIn: number, trimOut: number) => void;
  onTrimEnd: (shotId: string, trimIn: number, trimOut: number) => void;
}

export function useTrimDrag({
  pixelsPerSecond,
  onTrimChange,
  onTrimEnd,
}: UseTrimDragOptions) {
  const [trimState, setTrimState] = useState<TrimState | null>(null);
  const [currentTrimIn, setCurrentTrimIn] = useState<number | null>(null);
  const [currentTrimOut, setCurrentTrimOut] = useState<number | null>(null);
  const originalValuesRef = useRef<{ trimIn: number; trimOut: number } | null>(
    null
  );

  const startTrim = useCallback(
    (
      e: React.MouseEvent,
      shotId: string,
      edge: "in" | "out",
      currentTrimIn: number,
      currentTrimOut: number
    ) => {
      e.preventDefault();
      e.stopPropagation();

      originalValuesRef.current = { trimIn: currentTrimIn, trimOut: currentTrimOut };
      setCurrentTrimIn(currentTrimIn);
      setCurrentTrimOut(currentTrimOut);

      setTrimState({
        shotId,
        edge,
        initialValue: edge === "in" ? currentTrimIn : currentTrimOut,
        initialMouseX: e.clientX,
      });
    },
    []
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!trimState || !originalValuesRef.current) return;

      const deltaPixels = e.clientX - trimState.initialMouseX;
      const deltaSeconds = deltaPixels / pixelsPerSecond;
      const newValue = trimState.initialValue + deltaSeconds;

      let newTrimIn = currentTrimIn ?? originalValuesRef.current.trimIn;
      let newTrimOut = currentTrimOut ?? originalValuesRef.current.trimOut;

      if (trimState.edge === "in") {
        // Clamp trim_in: 0 <= trim_in < trim_out - 0.5
        newTrimIn = Math.max(0, Math.min(newValue, newTrimOut - 0.5));
        setCurrentTrimIn(newTrimIn);
      } else {
        // Clamp trim_out: trim_in + 0.5 <= trim_out <= 8
        newTrimOut = Math.max(newTrimIn + 0.5, Math.min(8, newValue));
        setCurrentTrimOut(newTrimOut);
      }

      // Optimistic update during drag
      onTrimChange(trimState.shotId, newTrimIn, newTrimOut);
    },
    [trimState, pixelsPerSecond, currentTrimIn, currentTrimOut, onTrimChange]
  );

  const handleMouseUp = useCallback(() => {
    if (!trimState) return;

    const finalTrimIn = currentTrimIn ?? originalValuesRef.current?.trimIn ?? 0;
    const finalTrimOut = currentTrimOut ?? originalValuesRef.current?.trimOut ?? 8;

    // Persist to database
    onTrimEnd(trimState.shotId, finalTrimIn, finalTrimOut);

    setTrimState(null);
    setCurrentTrimIn(null);
    setCurrentTrimOut(null);
    originalValuesRef.current = null;
  }, [trimState, currentTrimIn, currentTrimOut, onTrimEnd]);

  // Add global mouse event listeners when dragging
  useEffect(() => {
    if (trimState) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);

      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [trimState, handleMouseMove, handleMouseUp]);

  return {
    isDragging: trimState !== null,
    draggingShotId: trimState?.shotId ?? null,
    draggingEdge: trimState?.edge ?? null,
    startTrim,
  };
}
