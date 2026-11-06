import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowsHorizontal, Minus, Plus } from "@phosphor-icons/react";
import { t } from "../i18n";
export interface PreviewImage {
  dataUrl: string;
  width: number;
  height: number;
}

export function ImageStage({
  before,
  after,
  beforeLabel = t("before"),
  afterLabel = t("after"),
}: {
  before: PreviewImage;
  after?: PreviewImage | null;
  beforeLabel?: string;
  afterLabel?: string;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const layers = useRef<(HTMLDivElement | null)[]>([]);
  const transform = useRef({ scale: 1, x: 0, y: 0 });
  const size = useRef({ width: 0, height: 0 });
  const fitMode = useRef(true);
  const drag = useRef<{ id: number; x: number; y: number; tx: number; ty: number } | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => setUnavailable(false), [before.dataUrl, after?.dataUrl]);
  const [split, setSplit] = useState(50);
  const [scaleLabel, setScaleLabel] = useState(100);
  const reference = after ?? before;
  const minimumScale = () => {
    const { width, height } = size.current;
    return reference.width > 0 && reference.height > 0 && width > 0 && height > 0
      ? Math.min(width / reference.width, height / reference.height)
      : 1;
  };
  const constrain = (value: { scale: number; x: number; y: number }) => {
    const { width, height } = size.current;
    const limit = (position: number, viewportEdge: number, imageEdge: number) =>
      imageEdge <= viewportEdge
        ? (viewportEdge - imageEdge) / 2
        : Math.max(viewportEdge - imageEdge, Math.min(0, position));
    return {
      ...value,
      x: limit(value.x, width, reference.width * value.scale),
      y: limit(value.y, height, reference.height * value.scale),
    };
  };
  const apply = () => {
    const v = (transform.current = constrain(transform.current));
    for (const layer of layers.current)
      if (layer) {
        layer.style.width = `${reference.width}px`;
        layer.style.height = `${reference.height}px`;
        layer.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.scale})`;
        for (const image of layer.querySelectorAll("img")) image.style.imageRendering = v.scale >= 3 ? "pixelated" : "";
      }
    setScaleLabel(Math.round(v.scale * 100));
  };
  const fit = () => {
    fitMode.current = true;
    const { width, height } = size.current;
    if (!width || !height) return;
    const scale = minimumScale();
    transform.current = { scale, x: (width - reference.width * scale) / 2, y: (height - reference.height * scale) / 2 };
    apply();
  };
  const zoom = (scale: number, x = size.current.width / 2, y = size.current.height / 2) => {
    fitMode.current = false;
    const previous = transform.current;
    const min = Math.min(1, minimumScale());
    const next = Math.max(min, Math.min(Math.max(8, min), scale));
    transform.current = {
      scale: next,
      x: x - ((x - previous.x) * next) / previous.scale,
      y: y - ((y - previous.y) * next) / previous.scale,
    };
    apply();
  };
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    fitMode.current = true;
    drag.current = null;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) return;
      const previous = size.current;
      size.current = { width, height };
      if (fitMode.current) fit();
      else {
        transform.current = {
          ...transform.current,
          x: transform.current.x + (width - previous.width) / 2,
          y: transform.current.y + (height - previous.height) / 2,
        };
        apply();
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [before.dataUrl, after?.dataUrl, reference.width, reference.height]);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const pixelScale = rect.width / element.clientWidth || 1;
      zoom(
        transform.current.scale * Math.exp(-event.deltaY * 0.0015),
        (event.clientX - rect.left) / pixelScale,
        (event.clientY - rect.top) / pixelScale,
      );
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [before.dataUrl, after?.dataUrl, reference.width, reference.height]);
  const updateSplit = (clientX: number) => {
    const rect = viewport.current?.getBoundingClientRect();
    if (rect?.width) setSplit(Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)));
  };
  return (
    <div className="image-compare">
      <div className="image-compare-toolbar" title={t("viewerHelp")}>
        <button onClick={fit}>{t("fit")}</button>
        <button onClick={() => zoom(1)}>100%</button>
        <div className="row">
          <button aria-label={t("zoomOut")} onClick={() => zoom(transform.current.scale / 1.25)}>
            <Minus size={16} />
          </button>
          <span className="image-compare-scale">{scaleLabel}%</span>
          <button aria-label={t("zoomIn")} onClick={() => zoom(transform.current.scale * 1.25)}>
            <Plus size={16} />
          </button>
        </div>
      </div>
      <div
        ref={viewport}
        className="image-compare-viewport"
        onDoubleClick={() => (fitMode.current ? zoom(1) : fit())}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          drag.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            tx: transform.current.x,
            ty: transform.current.y,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (!current || current.id !== event.pointerId) return;
          const pixelScale = event.currentTarget.getBoundingClientRect().width / event.currentTarget.clientWidth || 1;
          transform.current = {
            ...transform.current,
            x: current.tx + (event.clientX - current.x) / pixelScale,
            y: current.ty + (event.clientY - current.y) / pixelScale,
          };
          apply();
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
      >
        <div
          className="image-compare-layer"
          ref={(element) => {
            layers.current[0] = element;
          }}
        >
          <img
            src={(after ?? before).dataUrl}
            alt={after ? afterLabel : beforeLabel}
            draggable={false}
            onError={() => setUnavailable(true)}
          />
        </div>
        {after && (
          <>
            <div className="image-compare-before" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
              <div
                className="image-compare-layer"
                ref={(element) => {
                  layers.current[1] = element;
                }}
              >
                <img src={before.dataUrl} alt={beforeLabel} draggable={false} onError={() => setUnavailable(true)} />
              </div>
            </div>
            <div
              className="image-compare-divider"
              style={{ left: `${split}%` }}
              role="slider"
              tabIndex={0}
              aria-label={t("compare")}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(split)}
              onPointerDown={(event) => {
                event.stopPropagation();
                event.currentTarget.setPointerCapture(event.pointerId);
                updateSplit(event.clientX);
              }}
              onPointerMove={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.stopPropagation();
                  updateSplit(event.clientX);
                }
              }}
              onPointerUp={(event) => {
                event.stopPropagation();
                if (event.currentTarget.hasPointerCapture(event.pointerId))
                  event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onKeyDown={(event) => {
                const value =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? 100
                      : event.key === "ArrowLeft"
                        ? split - 2
                        : event.key === "ArrowRight"
                          ? split + 2
                          : null;
                if (value != null) {
                  event.preventDefault();
                  setSplit(Math.max(0, Math.min(100, value)));
                }
              }}
            >
              <span>
                <ArrowsHorizontal size={18} />
              </span>
            </div>
          </>
        )}
        {unavailable && <div className="preview-unavailable">{t("missing")}</div>}
      </div>
    </div>
  );
}
