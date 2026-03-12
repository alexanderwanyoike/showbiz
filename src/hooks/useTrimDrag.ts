import { useState, useCallback, useRef, useEffect } from "react";

interface TrimState {
  shotId: string;
  edge: "in" | "out";
  initialValue: number;
  initialMouseX: number;
  maxDuration: number;
}

interface UseTrimDragOptions {
  pixelsPerSecond: number;
  onTrimChange: (shotId: string, trimIn: number, trimOut: number) => void;
  onTrimEnd: (shotId: string, trimIn: number, trimOut: number) => void;
}

// Get snap precision based on zoom level (more zoomed = finer precision)
function getSnapPrecision(pixelsPerSecond: number): number {
  if (pixelsPerSecond >= 150) {
    return 0.01; // 10ms precision when very zoomed in
  } else if (pixelsPerSecond >= 100) {
    return 0.05; // 50ms precision
  } else if (pixelsPerSecond >= 50) {
    return 0.1; // 100ms precision
  } else {
    return 0.25; // 250ms precision when zoomed out
  }
}

// Round to snap precision
function snapToGrid(value: number, precision: number): number {
  return Math.round(value / precision) * precision;
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
      currentTrimOut: number,
      maxDuration: number
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
        maxDuration,
      });
    },
    []
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!trimState || !originalValuesRef.current) return;

      const deltaPixels = e.clientX - trimState.initialMouseX;
      const deltaSeconds = deltaPixels / pixelsPerSecond;
      const precision = getSnapPrecision(pixelsPerSecond);
      const newValue = snapToGrid(trimState.initialValue + deltaSeconds, precision);

      let newTrimIn = currentTrimIn ?? originalValuesRef.current.trimIn;
      let newTrimOut = currentTrimOut ?? originalValuesRef.current.trimOut;

      if (trimState.edge === "in") {
        // Clamp trim_in: 0 <= trim_in < trim_out - 0.5
        newTrimIn = Math.max(0, Math.min(newValue, newTrimOut - 0.5));
        newTrimIn = snapToGrid(newTrimIn, precision);
        setCurrentTrimIn(newTrimIn);
      } else {
        // Clamp trim_out: trim_in + 0.5 <= trim_out <= maxDuration
        newTrimOut = Math.max(newTrimIn + 0.5, Math.min(trimState.maxDuration, newValue));
        newTrimOut = snapToGrid(newTrimOut, precision);
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
    const finalTrimOut = currentTrimOut ?? originalValuesRef.current?.trimOut ?? trimState.maxDuration;

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
