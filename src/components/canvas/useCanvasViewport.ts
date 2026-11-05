import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { clampCanvasView, fitView, screenToImg, zoomCanvasAt, type View } from "./geometry";

export function useCanvasViewport(width: number, height: number, interacting?: RefObject<boolean>) {
  const viewport = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ scale: 1, tx: 0, ty: 0 });
  const current = useRef(view),
    size = useRef({ width: 0, height: 0 });
  const fitted = useRef(true);
  const publish = useCallback((next: View) => {
    current.current = next;
    setView(next);
  }, []);
  const fit = useCallback(() => {
    fitted.current = true;
    publish(fitView(width, height, size.current.width, size.current.height, 32, 0.001));
  }, [width, height, publish]);
  useLayoutEffect(() => {
    const element = viewport.current!;
    fitted.current = true;
    const observer = new ResizeObserver(([entry]) => {
      const previous = size.current;
      size.current = { width: entry.contentRect.width, height: entry.contentRect.height };
      if (!size.current.width || !size.current.height) return;
      if (fitted.current) fit();
      else
        publish({
          ...current.current,
          tx: current.current.tx + (size.current.width - previous.width) / 2,
          ty: current.current.ty + (size.current.height - previous.height) / 2,
        });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [fit, publish]);
  const zoom = useCallback(
    (factor: number, x = size.current.width / 2, y = size.current.height / 2) => {
      fitted.current = false;
      publish(
        zoomCanvasAt(current.current, x, y, factor, width, height, size.current.width, size.current.height, 0.001),
      );
    },
    [width, height, publish],
  );
  useEffect(() => {
    const element = viewport.current!;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (interacting?.current) return;
      const rect = element.getBoundingClientRect();
      zoom(Math.exp(-event.deltaY * 0.0015), event.clientX - rect.left, event.clientY - rect.top);
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [zoom, interacting]);
  const pan = (start: View, dx: number, dy: number) => {
    fitted.current = false;
    publish(
      clampCanvasView(
        { ...start, tx: start.tx + dx, ty: start.ty + dy },
        width,
        height,
        size.current.width,
        size.current.height,
        0.001,
      ),
    );
  };
  const point = (event: { clientX: number; clientY: number }) => {
    const bounds = viewport.current!.getBoundingClientRect();
    return screenToImg(current.current, event.clientX - bounds.left, event.clientY - bounds.top);
  };
  return { viewport, view, current, fit, zoom, pan, point };
}
