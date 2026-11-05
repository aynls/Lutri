import { useState, type ReactNode } from "react";
import { t } from "../i18n";

export function ResizablePanel({
  children,
  className,
  storageKey,
  initialWidth = 340,
}: {
  children: ReactNode;
  className: string;
  storageKey: string;
  initialWidth?: number;
}) {
  const [width, setWidth] = useState(() => Number(localStorage.getItem(storageKey)) || initialWidth);
  const resize = (next: number) => {
    const value = Math.max(280, Math.min(520, next));
    setWidth(value);
    localStorage.setItem(storageKey, String(value));
  };
  return (
    <aside className={`${className} resizable-panel`} style={{ width }}>
      {children}
      <div
        className="panel-resizer"
        role="separator"
        aria-label={t("resizePanel")}
        aria-orientation="vertical"
        aria-valuemin={280}
        aria-valuemax={520}
        aria-valuenow={width}
        tabIndex={0}
        onDoubleClick={() => resize(initialWidth)}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            resize(width + (event.key === "ArrowLeft" ? -16 : 16));
          }
        }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          event.preventDefault();
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            resize(event.clientX - event.currentTarget.parentElement!.getBoundingClientRect().left);
        }}
        onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
      />
    </aside>
  );
}
