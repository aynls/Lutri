import { useState } from "react";

export function useEditHistory<T>(initial: T, limit = 60) {
  const [history, setHistory] = useState<{ past: T[]; present: T; future: T[] }>({
    past: [],
    present: initial,
    future: [],
  });
  const change = (next: T | ((value: T) => T)) =>
    setHistory((current) => ({
      past: [...current.past.slice(-(limit - 1)), current.present],
      present: typeof next === "function" ? (next as (value: T) => T)(current.present) : next,
      future: [],
    }));
  const undo = () =>
    setHistory((current) =>
      !current.past.length
        ? current
        : {
            past: current.past.slice(0, -1),
            present: current.past[current.past.length - 1],
            future: [current.present, ...current.future],
          },
    );
  const redo = () =>
    setHistory((current) =>
      !current.future.length
        ? current
        : {
            past: [...current.past, current.present],
            present: current.future[0],
            future: current.future.slice(1),
          },
    );
  const reset = (present: T) => setHistory({ past: [], present, future: [] });
  return {
    value: history.present,
    change,
    undo,
    redo,
    reset,
    canUndo: !!history.past.length,
    canRedo: !!history.future.length,
  };
}
