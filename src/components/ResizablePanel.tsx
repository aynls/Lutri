import { useState, type ReactNode } from "react";
import { t } from "../i18n";

export function ResizablePanel({
  children,
  className,
  storageKey,
  initialWidth = 340,
  minWidth = 280,
  maxWidth = 520,
  side = "left",
}: {
  children: ReactNode;
  className: string;
  storageKey: string;
  initialWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  side?: "left" | "right";
}) {
  const [width, setWidth] = useState(() => Number(localStorage.getItem(storageKey)) || initialWidth);
  const resize = (next: number) => {
    const value = Math.max(minWidth, Math.min(maxWidth, next));
    setWidth(value);
    localStorage.setItem(storageKey, String(value));
  };
  return (
    <aside className={`${className} resizable-panel`} style={{ width }}>
      {children}
      <div
        className={`panel-resizer${side === "right" ? " mirror" : ""}`}
        role="separator"
        aria-label={t("resizePanel")}
        aria-orientation="vertical"
        aria-valuemin={minWidth}
        aria-valuemax={maxWidth}
        aria-valuenow={width}
        tabIndex={0}
        onDoubleClick={() => resize(initialWidth)}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            const step = event.key === "ArrowLeft" ? -16 : 16;
            resize(width + (side === "right" ? -step : step));
          }
        }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          event.preventDefault();
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            const rect = event.currentTarget.parentElement!.getBoundingClientRect();
            resize(side === "right" ? rect.right - event.clientX : event.clientX - rect.left);
          }
        }}
        onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
      />
    </aside>
  );
}
