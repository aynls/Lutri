import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  ArrowCounterClockwiseIcon,
  ArrowClockwiseIcon,
  PaintBrushIcon,
  EraserIcon,
  RectangleIcon,
  HandIcon,
  MinusIcon,
  PlusIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react";
import type { GalleryEntry, GenerationDraft, StoredImage } from "../../domain/types";
import { t } from "../../i18n";
import { imageUrl } from "../../services/native";
import { saveMask } from "../../services/store";
import { Dialog } from "../../components/Dialog";
import { useEditHistory } from "../../components/useEditHistory";
import { useCanvasViewport } from "../../components/canvas/useCanvasViewport";
import { rectFromDrag, type Rect, type View } from "../../components/canvas/geometry";

type Tool = "brush" | "erase" | "rectangle" | "pan";
type Gesture =
  | { kind: "pan"; x: number; y: number; view: View }
  | { kind: "paint" | "rectangle"; x: number; y: number; previous: { x: number; y: number } };
export function MaskEditor({
  draft,
  gallery,
  masks,
  onChange,
  onClose,
  onError,
}: {
  draft: GenerationDraft;
  gallery: GalleryEntry[];
  masks: StoredImage[];
  onChange: (draft: GenerationDraft) => void;
  onClose: () => void;
  onError: (error: unknown) => void;
}) {
  const reference =
      draft.creationMode === "edit"
        ? draft.references.find((ref) => ref.id === draft.editTargetId)
        : draft.references[0],
    entry = gallery.find((entry) => entry.asset.id === reference?.assetId);
  return (
    <Dialog title={t("mask")} className="mask-dialog" onClose={onClose}>
      {entry && reference ? (
        <MaskWorkspace
          key={entry.asset.id}
          entry={entry}
          mask={
            draft.mask?.referenceId === reference.id
              ? masks.find((entry) => entry.asset.id === draft.mask?.assetId)
              : undefined
          }
          onClose={onClose}
          onError={onError}
          onApply={async (dataUrl) => {
            const asset = await saveMask(dataUrl);
            onChange({ ...draft, mask: { assetId: asset.asset.id, referenceId: reference.id } });
            onClose();
          }}
        />
      ) : (
        <div className="empty-state">{t("missing")}</div>
      )}
    </Dialog>
  );
}
function MaskWorkspace({
  entry,
  mask,
  onApply,
  onClose,
  onError,
}: {
  entry: GalleryEntry;
  mask?: StoredImage;
  onApply: (dataUrl: string) => Promise<void>;
  onClose: () => void;
  onError: (error: unknown) => void;
}) {
  const { width, height } = entry.asset;
  const view = useCanvasViewport(width, height),
    history = useEditHistory("", 20);
  const [rasterCanvas] = useState(() => document.createElement("canvas"));
  const raster = useRef<HTMLCanvasElement>(rasterCanvas),
    overlay = useRef<HTMLCanvasElement>(null);
  const gesture = useRef<Gesture>(undefined),
    rectangle = useRef<Rect>(undefined);
  const fileInput = useRef<HTMLInputElement>(null);
  const [tool, setTool] = useState<Tool>("brush"),
    [brush, setBrush] = useState(32),
    [opacity, setOpacity] = useState(0.5);
  const [space, setSpace] = useState(false),
    [ready, setReady] = useState(false),
    [saving, setSaving] = useState(false),
    [missing, setMissing] = useState(false);
  const [preview, setPreview] = useState<Rect>(),
    [cursor, setCursor] = useState<{ x: number; y: number }>();
  const drawOverlay = () => {
    const context = raster.current.getContext("2d")!,
      display = overlay.current!.getContext("2d")!;
    const pixels = context.getImageData(0, 0, width, height);
    for (let index = 0; index < pixels.data.length; index += 4) {
      const alpha = pixels.data[index];
      pixels.data[index] = 209;
      pixels.data[index + 1] = 126;
      pixels.data[index + 2] = 85;
      pixels.data[index + 3] = alpha;
    }
    display.putImageData(pixels, 0, 0);
  };
  useEffect(() => {
    let disposed = false;
    raster.current.width = width;
    raster.current.height = height;
    overlay.current!.width = width;
    overlay.current!.height = height;
    const context = raster.current.getContext("2d")!;
    context.fillStyle = "black";
    context.fillRect(0, 0, width, height);
    const load = async () => {
      if (mask) {
        const image = new Image();
        image.src = imageUrl(mask.path);
        await image.decode();
        if (disposed) return;
        context.drawImage(image, 0, 0, width, height);
      }
      if (!disposed) history.reset(raster.current.toDataURL("image/png"));
    };
    void load().catch(onError);
    return () => {
      disposed = true;
    };
  }, [entry.asset.id, mask?.asset.id]);
  useEffect(() => {
    if (!history.value) return;
    let disposed = false;
    setReady(false);
    const image = new Image();
    image.src = history.value;
    void image
      .decode()
      .then(() => {
        if (disposed) return;
        raster.current.getContext("2d")!.drawImage(image, 0, 0, width, height);
        drawOverlay();
        setReady(true);
      })
      .catch(onError);
    return () => {
      disposed = true;
    };
  }, [history.value]);
  const commit = () => history.change(raster.current.toDataURL("image/png"));
  const paint = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const context = raster.current.getContext("2d")!,
      display = overlay.current!.getContext("2d")!;
    for (const [target, color, operation] of [
      [context, tool === "erase" ? "black" : "white", "source-over"],
      [
        display,
        getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#d17e55",
        tool === "erase" ? "destination-out" : "source-over",
      ],
    ] as const) {
      target.globalCompositeOperation = operation;
      target.strokeStyle = color;
      target.fillStyle = color;
      target.lineWidth = brush;
      target.lineCap = "round";
      target.beginPath();
      target.moveTo(from.x, from.y);
      target.lineTo(to.x, to.y);
      target.stroke();
      target.beginPath();
      target.arc(to.x, to.y, brush / 2, 0, Math.PI * 2);
      target.fill();
      target.globalCompositeOperation = "source-over";
    }
  };
  const begin = (event: PointerEvent<HTMLDivElement>) => {
    if (!ready || saving || (event.button !== 0 && event.button !== 1)) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    if (tool === "pan" || space || event.button === 1) {
      gesture.current = { kind: "pan", x: event.clientX, y: event.clientY, view: view.current.current };
      return;
    }
    const point = view.point(event);
    if (point.x < 0 || point.y < 0 || point.x > width || point.y > height) return;
    gesture.current = { kind: tool === "rectangle" ? "rectangle" : "paint", ...point, previous: point };
    if (tool !== "rectangle") paint(point, point);
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const point = view.point(event);
    setCursor(point);
    const start = gesture.current;
    if (!start) return;
    if (start.kind === "pan") view.pan(start.view, event.clientX - start.x, event.clientY - start.y);
    else if (start.kind === "paint") {
      paint(start.previous, point);
      start.previous = point;
    } else {
      rectangle.current = rectFromDrag(start.x, start.y, point.x, point.y, width, height);
      setPreview(rectangle.current);
    }
  };
  const finish = () => {
    const start = gesture.current;
    gesture.current = undefined;
    if (start?.kind === "rectangle" && rectangle.current) {
      const rect = rectangle.current,
        context = raster.current.getContext("2d")!;
      context.fillStyle = "white";
      context.fillRect(rect.x, rect.y, rect.w, rect.h);
      rectangle.current = undefined;
      setPreview(undefined);
      drawOverlay();
    }
    if (start && start.kind !== "pan") commit();
  };
  const importMask = async (file: File) => {
    setReady(false);
    try {
      const url = URL.createObjectURL(file),
        image = new Image();
      try {
        image.src = url;
        await image.decode();
      } finally {
        URL.revokeObjectURL(url);
      }
      if (image.naturalWidth !== width || image.naturalHeight !== height) throw new Error(t("maskSizeError"));
      const context = raster.current.getContext("2d")!;
      context.clearRect(0, 0, width, height);
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, width, height);
      let alphaMask = false;
      for (let index = 3; index < pixels.data.length; index += 4)
        if (pixels.data[index] < 255) {
          alphaMask = true;
          break;
        }
      for (let index = 0; index < pixels.data.length; index += 4) {
        const value = alphaMask
          ? 255 - pixels.data[index + 3]
          : (pixels.data[index] + pixels.data[index + 1] + pixels.data[index + 2]) / 3;
        pixels.data[index] = pixels.data[index + 1] = pixels.data[index + 2] = value >= 128 ? 255 : 0;
        pixels.data[index + 3] = 255;
      }
      context.putImageData(pixels, 0, 0);
      commit();
    } finally {
      setReady(true);
    }
  };
  return (
    <div
      className="mask-workspace"
      onKeyDown={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("input, textarea, select, [role=combobox], [role=listbox]")) return;
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
          event.preventDefault();
          if (ready) event.shiftKey ? history.redo() : history.undo();
        } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
          event.preventDefault();
          if (ready) history.redo();
        }
      }}
    >
      <div className="canvas-toolbar">
        <div className="canvas-tools">
          {(
            [
              ["brush", PaintBrushIcon, "brushTool"],
              ["erase", EraserIcon, "eraserTool"],
              ["rectangle", RectangleIcon, "rectangleTool"],
              ["pan", HandIcon, "panTool"],
            ] as const
          ).map(([id, Icon, title]) => (
            <button
              key={id}
              title={t(title)}
              aria-label={t(title)}
              aria-pressed={tool === id}
              onClick={() => setTool(id)}
            >
              <Icon size={18} />
            </button>
          ))}
        </div>
        <button title={t("undo")} disabled={!ready || !history.canUndo} onClick={history.undo}>
          <ArrowCounterClockwiseIcon />
        </button>
        <button title={t("redo")} disabled={!ready || !history.canRedo} onClick={history.redo}>
          <ArrowClockwiseIcon />
        </button>
        <span className="toolbar-spacer" />
        <button onClick={view.fit}>{t("fit")}</button>
        <button aria-label={t("zoomOut")} onClick={() => view.zoom(0.8)}>
          <MinusIcon />
        </button>
        <span className="zoom-level">{Math.round(view.view.scale * 100)}%</span>
        <button aria-label={t("zoomIn")} onClick={() => view.zoom(1.25)}>
          <PlusIcon />
        </button>
      </div>
      <div className="mask-options">
        <label>
          {t("brushSize")}
          <input
            type="range"
            min={1}
            max={256}
            value={brush}
            onChange={(event) => setBrush(Number(event.target.value))}
          />
          <span>{brush}px</span>
        </label>
        <label>
          {t("opacity")}
          <input
            type="range"
            min={0.1}
            max={0.9}
            step={0.05}
            value={opacity}
            onChange={(event) => setOpacity(Number(event.target.value))}
          />
        </label>
        <span className="toolbar-spacer" />
        <button disabled={!ready} onClick={() => fileInput.current?.click()}>
          <UploadSimpleIcon />
          {t("importMask")}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/png"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importMask(file).catch(onError);
            event.target.value = "";
          }}
        />
        <button
          disabled={!ready}
          onClick={() => {
            const context = raster.current.getContext("2d")!;
            context.fillStyle = "black";
            context.fillRect(0, 0, width, height);
            commit();
          }}
        >
          {t("clearMask")}
        </button>
        <button
          disabled={!ready}
          onClick={() => {
            const context = raster.current.getContext("2d")!,
              pixels = context.getImageData(0, 0, width, height);
            for (let index = 0; index < pixels.data.length; index += 4)
              pixels.data[index] = pixels.data[index + 1] = pixels.data[index + 2] = 255 - pixels.data[index];
            context.putImageData(pixels, 0, 0);
            commit();
          }}
        >
          {t("invertMask")}
        </button>
      </div>
      <div
        ref={view.viewport}
        className="editing-viewport mask-viewport"
        tabIndex={0}
        aria-label={t("mask")}
        style={{ cursor: space || tool === "pan" ? "grab" : "crosshair" }}
        onPointerDown={begin}
        onPointerMove={move}
        onPointerLeave={() => setCursor(undefined)}
        onPointerUp={(event) => {
          finish();
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={finish}
        onLostPointerCapture={finish}
        onKeyDown={(event) => {
          if (event.code === "Space") {
            event.preventDefault();
            setSpace(true);
          }
        }}
        onKeyUp={(event) => {
          if (event.code === "Space") setSpace(false);
        }}
        onBlur={() => setSpace(false)}
      >
        <div
          className="editing-world mask-world"
          style={{
            width,
            height,
            transform: `translate(${view.view.tx}px, ${view.view.ty}px) scale(${view.view.scale})`,
          }}
        >
          <img src={imageUrl(entry.path)} alt={entry.asset.id} draggable={false} onError={() => setMissing(true)} />
          <canvas ref={overlay} style={{ opacity }} />
          {preview && (
            <div
              className="mask-rectangle-preview"
              style={{ left: preview.x, top: preview.y, width: preview.w, height: preview.h, opacity }}
            />
          )}
          {cursor && (tool === "brush" || tool === "erase") && !space && (
            <span
              className="brush-cursor"
              style={{
                left: cursor.x - brush / 2,
                top: cursor.y - brush / 2,
                width: brush,
                height: brush,
                borderWidth: 1 / view.view.scale,
              }}
            />
          )}
        </div>
        {missing && <span className="canvas-error">{t("missing")}</span>}
      </div>
      <footer className="editor-footer">
        <span className="muted">
          {entry.asset.id} · {width} × {height}
        </span>
        <span className="toolbar-spacer" />
        <button onClick={onClose}>{t("cancel")}</button>
        <button
          className="primary-button"
          disabled={!ready || saving || missing}
          onClick={() => {
            setSaving(true);
            void onApply(raster.current.toDataURL("image/png"))
              .catch(onError)
              .finally(() => setSaving(false));
          }}
        >
          {t("apply")}
        </button>
      </footer>
    </div>
  );
}
