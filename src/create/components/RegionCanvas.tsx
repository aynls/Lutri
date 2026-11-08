import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { MinusIcon, PlusIcon, HandIcon, CursorIcon, BoundingBoxIcon } from "@phosphor-icons/react";
import type { Rectangle } from "../../domain/types";
import { useCanvasViewport } from "../../components/canvas/useCanvasViewport";
import {
  HANDLES,
  handlePoint,
  hitTest,
  pickHandle,
  moveRect,
  resizeRect,
  rectFromDrag,
  type Rect,
  type Handle,
  type View,
} from "../../components/canvas/geometry";
import { toNormalized, toPixels } from "./regionGeometry";
import { imageUrl } from "../../services/native";
import { t } from "../../i18n";

interface CanvasBox {
  id: string;
  value: Rectangle;
  color: string;
}
type Tool = "select" | "draw" | "pan";
type Gesture = { pointerId: number } & (
  | { kind: "pan"; view: View; x: number; y: number }
  | { kind: "draw" | "move" | "resize"; x: number; y: number; box?: CanvasBox; rect?: Rect; handle?: Handle }
);
const cursors: Record<Handle, string> = {
  nw: "nwse-resize",
  n: "ns-resize",
  ne: "nesw-resize",
  e: "ew-resize",
  se: "nwse-resize",
  s: "ns-resize",
  sw: "nesw-resize",
  w: "ew-resize",
};
export function RegionCanvas({
  width,
  height,
  background,
  opacity = 0.7,
  boxes,
  selected,
  canCreate = true,
  onSelect,
  onChange,
  onCreate,
}: {
  width: number;
  height: number;
  background?: string;
  opacity?: number;
  boxes: CanvasBox[];
  selected?: string;
  canCreate?: boolean;
  onSelect: (id?: string) => void;
  onChange: (id: string, rectangle: Rectangle) => void;
  onCreate: (rectangle: Rectangle) => void;
}) {
  const interacting = useRef(false);
  const canvas = useCanvasViewport(width, height, interacting);
  const [tool, setTool] = useState<Tool>("select"),
    [space, setSpace] = useState(false);
  const [hover, setHover] = useState<{ x: number; y: number }>();
  const [preview, setPreview] = useState<{ id?: string; rect: Rect }>();
  const [interaction, setInteraction] = useState<Gesture>();
  const gesture = useRef<Gesture>(undefined),
    latest = useRef<typeof preview>(undefined);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (!canCreate && tool === "draw") setTool("select");
  }, [canCreate, tool]);
  const publishPreview = (value: typeof preview) => {
    latest.current = value;
    setPreview(value);
  };
  const publishGesture = (value: Gesture | undefined) => {
    gesture.current = value;
    interacting.current = !!value;
    setInteraction(value);
  };
  const selectedBox = boxes.find((box) => box.id === selected);
  const handleAt = (point: { x: number; y: number }) =>
    selectedBox
      ? pickHandle(toPixels(selectedBox.value, width, height), point.x, point.y, canvas.current.current.scale, 8)
      : null;
  const boxAt = (point: { x: number; y: number }) => {
    const contains = (box: CanvasBox) => hitTest(toPixels(box.value, width, height), point.x, point.y);
    return selectedBox && contains(selectedBox) ? selectedBox : [...boxes].reverse().find(contains);
  };
  const hoveredHandle = tool === "select" && !space && hover ? handleAt(hover) : null;
  const activeHandle = interaction?.kind === "resize" ? interaction.handle : interaction ? undefined : hoveredHandle;
  const cursor =
    interaction?.kind === "pan"
      ? "grabbing"
      : interaction?.kind === "draw"
        ? "crosshair"
        : interaction?.kind === "move"
          ? "move"
          : interaction?.kind === "resize"
            ? cursors[interaction.handle!]
            : space || tool === "pan"
              ? "grab"
              : tool === "draw"
                ? "crosshair"
                : hoveredHandle
                  ? cursors[hoveredHandle]
                  : hover && boxAt(hover)
                    ? "move"
                    : "crosshair";
  const cancel = () => {
    publishGesture(undefined);
    publishPreview(undefined);
  };
  const begin = (event: PointerEvent<HTMLDivElement>) => {
    if (gesture.current || ![0, 1, 2].includes(event.button)) return;
    event.preventDefault();
    event.currentTarget.focus();
    const point = canvas.point(event),
      pointerId = event.pointerId;
    setHover(point);
    // Right-drag always starts a new box, including over existing boxes and handles.
    if (event.button === 2 || (tool === "draw" && event.button === 0 && !space)) {
      if (!canCreate) return;
      if (point.x < 0 || point.x > width || point.y < 0 || point.y > height) return;
      publishGesture({ kind: "draw", x: point.x, y: point.y, pointerId });
      publishPreview({ rect: { ...point, w: 0, h: 0 } });
      onSelect(undefined);
    } else if (tool === "pan" || space || event.button === 1) {
      publishGesture({ kind: "pan", view: canvas.current.current, x: event.clientX, y: event.clientY, pointerId });
    } else {
      const handle = handleAt(point);
      const hit = handle ? selectedBox : boxAt(point);
      if (!hit) {
        onSelect(undefined);
        return;
      }
      onSelect(hit.id);
      publishGesture({
        kind: handle ? "resize" : "move",
        x: point.x,
        y: point.y,
        box: hit,
        rect: toPixels(hit.value, width, height),
        handle: handle ?? undefined,
        pointerId,
      });
    }
    event.currentTarget.setPointerCapture(pointerId);
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const start = gesture.current;
    if (start && start.pointerId !== event.pointerId) return;
    const point = canvas.point(event);
    setHover(point);
    if (!start) return;
    if (start.kind === "pan") {
      canvas.pan(start.view, event.clientX - start.x, event.clientY - start.y);
      return;
    }
    const dx = point.x - start.x,
      dy = point.y - start.y;
    const rect =
      start.kind === "draw"
        ? rectFromDrag(start.x, start.y, point.x, point.y, width, height)
        : start.kind === "move"
          ? moveRect(start.rect!, dx, dy, width, height)
          : resizeRect(start.rect!, start.handle!, dx, dy, 1, width, height);
    publishPreview({ id: start.box?.id, rect });
  };
  const finish = (event: PointerEvent<HTMLDivElement>) => {
    const start = gesture.current;
    if (!start || start.pointerId !== event.pointerId) return;
    // Capture the final position even when the pointer-up arrives before another move.
    move(event);
    const end = latest.current;
    cancel();
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (start.kind === "pan" || !end) return;
    if (start.kind === "draw" && (end.rect.w * canvas.view.scale < 3 || end.rect.h * canvas.view.scale < 3)) return;
    const value = toNormalized(end.rect, width, height);
    if (start.kind === "draw") onCreate(value);
    else if (value.some((coordinate, index) => coordinate !== start.box!.value[index])) onChange(start.box!.id, value);
  };
  const renderBox = (box: CanvasBox, index: number) => {
    const rect = preview?.id === box.id ? preview.rect : toPixels(box.value, width, height);
    const isSelected = selected === box.id;
    const tagWidth = Math.min(240, 18 + box.id.length * 7.5) / canvas.view.scale;
    return (
      <g key={box.id}>
        <rect
          x={rect.x}
          y={rect.y}
          width={rect.w}
          height={rect.h}
          fill={box.color}
          fillOpacity={isSelected ? 0.34 : 0.2}
          stroke={box.color}
          strokeWidth={isSelected ? 3.5 : 2.5}
          vectorEffect="non-scaling-stroke"
        />
        <g transform={`translate(${rect.x},${Math.max(0, rect.y - 23 / canvas.view.scale)})`} pointerEvents="none">
          <rect width={tagWidth} height={22 / canvas.view.scale} fill={box.color} rx={3 / canvas.view.scale} />
          <text x={6 / canvas.view.scale} y={15 / canvas.view.scale} fontSize={12 / canvas.view.scale} fill="#161514">
            {box.id || `#${index + 1}`}
          </text>
        </g>
        {isSelected &&
          HANDLES.map((handle) => {
            const point = handlePoint(rect, handle),
              highlighted = activeHandle === handle;
            return (
              <g
                key={handle}
                transform={`translate(${point.x}, ${point.y}) scale(${1 / canvas.view.scale})`}
                pointerEvents="none"
                style={{ "--handle-color": box.color } as CSSProperties}
              >
                <rect
                  className={`region-handle-halo${highlighted ? " highlighted" : ""}`}
                  x={-8}
                  y={-8}
                  width={16}
                  height={16}
                  rx={3}
                />
                <rect
                  className={`region-handle${highlighted ? " highlighted" : ""}${interaction?.kind === "resize" && highlighted ? " dragging" : ""}`}
                  x={-4.5}
                  y={-4.5}
                  width={9}
                  height={9}
                  rx={1.5}
                />
              </g>
            );
          })}
      </g>
    );
  };
  const readout = preview?.rect ?? (selectedBox ? toPixels(selectedBox.value, width, height) : undefined);
  return (
    <div className="region-canvas-workspace">
      <div className="canvas-toolbar">
        <div className="canvas-tools">
          {(
            [
              ["select", CursorIcon, "selectTool"],
              ["draw", BoundingBoxIcon, "drawRegion"],
              ["pan", HandIcon, "panTool"],
            ] as const
          ).map(([id, Icon, title]) => (
            <button
              key={id}
              title={t(title)}
              aria-label={t(title)}
              aria-pressed={tool === id}
              disabled={id === "draw" && !canCreate}
              onClick={() => setTool(id)}
            >
              <Icon size={18} />
            </button>
          ))}
        </div>
        <span className="canvas-dimensions">
          {width} × {height}
        </span>
        <span className="toolbar-spacer" />
        <button onClick={canvas.fit}>{t("fit")}</button>
        <button aria-label={t("zoomOut")} onClick={() => canvas.zoom(0.8)}>
          <MinusIcon />
        </button>
        <button className="zoom-level" onClick={() => canvas.zoom(1 / canvas.view.scale)}>
          {Math.round(canvas.view.scale * 100)}%
        </button>
        <button aria-label={t("zoomIn")} onClick={() => canvas.zoom(1.25)}>
          <PlusIcon />
        </button>
      </div>
      <div
        ref={canvas.viewport}
        className="editing-viewport"
        tabIndex={0}
        aria-label={t("layout")}
        style={{ cursor }}
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerLeave={() => {
          if (!gesture.current) setHover(undefined);
        }}
        onPointerCancel={cancel}
        onLostPointerCapture={cancel}
        onKeyDown={(event) => {
          if (event.code === "Space") {
            event.preventDefault();
            setSpace(true);
          }
          if (event.key === "Escape" && gesture.current) {
            event.preventDefault();
            event.stopPropagation();
            cancel();
            return;
          }
          if (
            gesture.current &&
            (((event.ctrlKey || event.metaKey) && ["z", "y"].includes(event.key.toLowerCase())) ||
              ["Delete", "Backspace"].includes(event.key))
          )
            cancel();
          if (gesture.current || event.ctrlKey || event.metaKey || event.altKey) return;
          if (event.key === "v") setTool("select");
          if (event.key === "r") setTool("draw");
          if (event.key === "h") setTool("pan");
          if (selectedBox && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
            event.preventDefault();
            const step = event.shiftKey ? 10 : 1;
            const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
            const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
            onChange(
              selectedBox.id,
              toNormalized(moveRect(toPixels(selectedBox.value, width, height), dx, dy, width, height), width, height),
            );
          }
        }}
        onKeyUp={(event) => {
          if (event.code === "Space") setSpace(false);
        }}
        onBlur={() => setSpace(false)}
      >
        <svg
          className="editing-world"
          width={width}
          height={height}
          style={{ transform: `translate(${canvas.view.tx}px, ${canvas.view.ty}px) scale(${canvas.view.scale})` }}
        >
          <rect width={width} height={height} fill="var(--canvas-paper)" />
          {background && (
            <image
              key={background}
              href={imageUrl(background)}
              width={width}
              height={height}
              opacity={opacity}
              preserveAspectRatio="xMidYMid meet"
              onError={() => setMissing(true)}
              onLoad={() => setMissing(false)}
            />
          )}
          {boxes.filter((box) => box.id !== selected).map(renderBox)}
          {selectedBox && renderBox(selectedBox, boxes.indexOf(selectedBox))}
          {preview && !preview.id && (
            <rect
              x={preview.rect.x}
              y={preview.rect.y}
              width={preview.rect.w}
              height={preview.rect.h}
              fill="var(--accent)"
              fillOpacity={0.12}
              stroke="var(--accent)"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        {!boxes.length && !preview && <span className="canvas-empty-hint">{t("drawRegionHint")}</span>}
        {background && missing && <span className="canvas-error">{t("missing")}</span>}
        {readout && (
          <output className="canvas-readout">
            X {Math.round(readout.x)} · Y {Math.round(readout.y)}
            <span>
              {Math.round(readout.w)} × {Math.round(readout.h)} px
            </span>
          </output>
        )}
      </div>
      <div className="canvas-status">{t("canvasHelp")}</div>
    </div>
  );
}
