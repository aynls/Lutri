import { useEffect, useState } from "react";
import {
  ArrowCounterClockwiseIcon,
  ArrowClockwiseIcon,
  PlusIcon,
  TrashIcon,
  CopyIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  BoundingBoxIcon,
} from "@phosphor-icons/react";
import type { GalleryEntry, GenerationDraft, Rectangle, Region } from "../../domain/types";
import { Dialog } from "../../components/Dialog";
import { ResizablePanel } from "../../components/ResizablePanel";
import { useEditHistory } from "../../components/useEditHistory";
import { AssetImage } from "../../gallery/AssetImage";
import { useApplication } from "../../services/store";
import { t } from "../../i18n";
import { combinationById } from "../../models";
import { RegionCanvas } from "./RegionCanvas";
import { operation, outputFrame, regionColors, toNormalized, toPixels } from "./regionGeometry";

function CommitText({
  value,
  onCommit,
  multiline = false,
  label,
}: {
  value: string;
  onCommit: (value: string) => void;
  multiline?: boolean;
  label: string;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const props = {
    value: text,
    "aria-label": label,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setText(event.target.value),
    onBlur: () => {
      if (text !== value) onCommit(text);
    },
  };
  return multiline ? (
    <textarea {...props} rows={3} />
  ) : (
    <input
      {...props}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}
function RectFields({
  value,
  width,
  height,
  onChange,
}: {
  value: Rectangle;
  width: number;
  height: number;
  onChange: (value: Rectangle) => void;
}) {
  const rect = toPixels(value, width, height);
  return (
    <div className="rectangle-fields">
      {(
        [
          ["x", "X"],
          ["y", "Y"],
          ["w", t("width")],
          ["h", t("height")],
        ] as const
      ).map(([key, title]) => (
        <label key={key}>
          {title}
          <input
            key={`${key}:${value.join(":")}`}
            aria-label={title}
            type="number"
            min={key === "w" || key === "h" ? 1 : 0}
            max={key === "x" || key === "w" ? width : height}
            defaultValue={Math.round(rect[key])}
            onBlur={(event) => {
              if (!event.currentTarget.checkValidity() || event.target.value === "") {
                event.currentTarget.value = String(Math.round(rect[key]));
                return;
              }
              const next = { ...rect, [key]: Number(event.target.value) };
              next.x = Math.min(next.x, width - 1);
              next.y = Math.min(next.y, height - 1);
              next.w = Math.min(next.w, width - next.x);
              next.h = Math.min(next.h, height - next.y);
              const normalized = toNormalized(next, width, height);
              if (normalized.join() !== value.join()) onChange(normalized);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
        </label>
      ))}
    </div>
  );
}
function SourceEditor({
  entry,
  value,
  onApply,
  onClose,
}: {
  entry: GalleryEntry;
  value: Rectangle;
  onApply: (value: Rectangle) => void;
  onClose: () => void;
}) {
  const history = useEditHistory(value);
  return (
    <Dialog
      title={`${t("pickSource")} · ${entry.asset.name}`}
      className="source-region-dialog"
      onClose={onClose}
      onKeyDown={(event) => {
        if ((event.target as HTMLElement).closest("input, textarea, select")) return;
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
          event.preventDefault();
          event.shiftKey ? history.redo() : history.undo();
        } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
          event.preventDefault();
          history.redo();
        }
      }}
      footer={
        <>
          <button onClick={history.undo} disabled={!history.canUndo} title={t("undo")}>
            <ArrowCounterClockwiseIcon />
          </button>
          <button onClick={history.redo} disabled={!history.canRedo} title={t("redo")}>
            <ArrowClockwiseIcon />
          </button>
          <span className="toolbar-spacer" />
          <button onClick={onClose}>{t("cancel")}</button>
          <button className="primary-button" onClick={() => onApply(history.value)}>
            {t("apply")}
          </button>
        </>
      }
    >
      <RegionCanvas
        width={entry.asset.width}
        height={entry.asset.height}
        background={entry.path}
        opacity={1}
        boxes={[{ id: "source", color: regionColors[0], value: history.value }]}
        selected="source"
        onSelect={() => {}}
        onChange={(_, value) => history.change(value)}
        onCreate={history.change}
      />
      <RectFields
        value={history.value}
        width={entry.asset.width}
        height={entry.asset.height}
        onChange={history.change}
      />
    </Dialog>
  );
}
export function LayoutEditor({
  draft,
  onApply,
  onClose,
}: {
  draft: GenerationDraft;
  onApply: (regions: Region[]) => void;
  onClose: () => void;
}) {
  const { gallery } = useApplication();
  const history = useEditHistory(structuredClone(draft.regions));
  const regions = history.value;
  const [selection, setSelection] = useState<string | undefined>(regions[0]?.id),
    [sourceEditor, setSourceEditor] = useState(false);
  const [background, setBackground] = useState(draft.references[0]?.id ?? ""),
    [opacity, setOpacity] = useState(0.65),
    [error, setError] = useState("");
  const first = gallery.find((entry) => entry.asset.id === draft.references[0]?.assetId);
  const frame =
    combinationById(draft.combinationId).regions === "seedream" && first
      ? { width: first.asset.width, height: first.asset.height }
      : outputFrame(draft, gallery);
  const selected = regions.find((region) => region.id === selection),
    selectedIndex = regions.findIndex((region) => region.id === selection);
  const reference = draft.references.find((entry) => entry.id === selected?.referenceId);
  const source = gallery.find((entry) => entry.asset.id === reference?.assetId);
  const backgroundEntry = gallery.find(
    (entry) => entry.asset.id === draft.references.find((reference) => reference.id === background)?.assetId,
  );
  const update = (id: string, change: Partial<Region>) =>
    history.change((current) => current.map((region) => (region.id === id ? { ...region, ...change } : region)));
  const newId = () => {
    let number = regions.length + 1;
    while (regions.some((region) => region.id === `object_${number}`)) number++;
    return `object_${number}`;
  };
  const add = (target: Rectangle = [250, 250, 750, 750]) => {
    const region: Region = { id: newId(), description: "", target, operation: "place" };
    history.change([...regions, region]);
    setSelection(region.id);
  };
  const remove = () => {
    if (selected) {
      history.change(regions.filter((entry) => entry.id !== selected.id));
      setSelection(undefined);
    }
  };
  const changeRectangle = (id: string, rectangle: Rectangle) => {
    const region = regions.find((entry) => entry.id === id)!;
    if (operation(region) === "remove") update(id, { source: rectangle });
    else if (operation(region) === "anchor") update(id, { source: rectangle, target: rectangle });
    else update(id, { target: rectangle });
  };
  const changeOperation = (kind: NonNullable<Region["operation"]>) => {
    if (!selected) return;
    const box = selected.target ?? selected.source ?? [250, 250, 750, 750];
    if (kind === "place")
      update(selected.id, { operation: kind, referenceId: undefined, source: undefined, target: box });
    else {
      const source = selected.source ?? box;
      update(selected.id, {
        operation: kind,
        referenceId: selected.referenceId ?? draft.references[0]?.id,
        source,
        target: kind === "remove" ? undefined : kind === "anchor" ? source : box,
      });
    }
  };
  const move = (direction: number) => {
    const next = [...regions],
      index = selectedIndex;
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    history.change(next);
  };
  return (
    <Dialog
      title={t("editLayout")}
      className="layout-dialog"
      onClose={onClose}
      onKeyDown={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("input, textarea, select, [contenteditable=true]")) return;
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
          event.preventDefault();
          event.shiftKey ? history.redo() : history.undo();
        } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
          event.preventDefault();
          history.redo();
        } else if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          remove();
        }
      }}
      footer={
        <>
          {error && (
            <span className="error-text" role="alert">
              {error}
            </span>
          )}
          <span className="toolbar-spacer" />
          <button onClick={onClose}>{t("cancel")}</button>
          <button className="primary-button" onClick={() => onApply(regions)}>
            {t("apply")}
          </button>
        </>
      }
    >
      <div className="layout-workspace">
        <ResizablePanel
          className="region-inspector"
          storageKey="lutri.layout.inspector"
          initialWidth={290}
          minWidth={220}
          maxWidth={420}
        >
          <div className="region-scroll">
            <div className="region-list-toolbar">
              <strong>
                {t("regions")} <small>{regions.length}</small>
              </strong>
              <span className="toolbar-spacer" />
              <button disabled={!history.canUndo} onClick={history.undo} title={t("undo")}>
                <ArrowCounterClockwiseIcon />
              </button>
              <button disabled={!history.canRedo} onClick={history.redo} title={t("redo")}>
                <ArrowClockwiseIcon />
              </button>
              <button onClick={() => add()} title={t("add")}>
                <PlusIcon />
              </button>
            </div>
            <div className="region-list">
              {regions.map((region, index) => (
                <button
                  key={region.id}
                  className={selected?.id === region.id ? "selected" : ""}
                  onClick={() => {
                    setSelection(region.id);
                    setError("");
                  }}
                >
                  <span className="region-color" style={{ background: regionColors[index % regionColors.length] }} />
                  <span>{region.id}</span>
                  <small>
                    {t(
                      operation(region) === "place"
                        ? "placeObject"
                        : operation(region) === "move"
                          ? "moveObject"
                          : operation(region) === "anchor"
                            ? "anchorObject"
                            : "removeObject",
                    )}
                  </small>
                </button>
              ))}
            </div>
            {selected ? (
              <div className="region-properties" key={selected.id}>
                <div className="region-object-actions">
                  <button
                    onClick={() => {
                      const id = newId();
                      history.change([...regions, { ...structuredClone(selected), id }]);
                      setSelection(id);
                    }}
                    title={t("duplicate")}
                  >
                    <CopyIcon />
                  </button>
                  <button disabled={selectedIndex === 0} title={t("moveUp")} onClick={() => move(-1)}>
                    <ArrowUpIcon />
                  </button>
                  <button disabled={selectedIndex === regions.length - 1} title={t("moveDown")} onClick={() => move(1)}>
                    <ArrowDownIcon />
                  </button>
                  <span className="toolbar-spacer" />
                  <button title={t("remove")} className="danger-button" onClick={remove}>
                    <TrashIcon />
                  </button>
                </div>
                <label>
                  {t("regionName")}
                  <CommitText
                    label={t("regionName")}
                    value={selected.id}
                    onCommit={(value) => {
                      const id = value.trim();
                      if (
                        !/^[A-Za-z0-9_]+$/.test(id) ||
                        regions.some((region) => region.id !== selected.id && region.id === id)
                      ) {
                        setError(t("regionNameError"));
                        return;
                      }
                      update(selected.id, { id });
                      setSelection(id);
                      setError("");
                    }}
                  />
                </label>
                {!!draft.references.length && (
                  <label>
                    {t("operation")}
                    <select
                      value={operation(selected)}
                      onChange={(event) => changeOperation(event.target.value as NonNullable<Region["operation"]>)}
                    >
                      <option value="place">{t("placeObject")}</option>
                      <option value="move">{t("moveObject")}</option>
                      <option value="anchor">{t("anchorObject")}</option>
                      <option value="remove">{t("removeObject")}</option>
                    </select>
                  </label>
                )}
                <label>
                  {t("description")}
                  <CommitText
                    label={t("description")}
                    value={selected.description}
                    onCommit={(description) => update(selected.id, { description })}
                    multiline
                  />
                </label>
                {selected.target && (
                  <section>
                    <h3>{t("target")}</h3>
                    <RectFields
                      value={selected.target}
                      width={frame.width}
                      height={frame.height}
                      onChange={(target) => changeRectangle(selected.id, target)}
                    />
                  </section>
                )}
                {operation(selected) !== "place" && (
                  <section className="source-binding">
                    <label>
                      {t("source")}
                      <select
                        value={selected.referenceId ?? ""}
                        onChange={(event) => {
                          update(selected.id, {
                            referenceId: event.target.value,
                            source: [0, 0, 1000, 1000],
                            ...(operation(selected) === "anchor" ? { target: [0, 0, 1000, 1000] as Rectangle } : {}),
                          });
                        }}
                      >
                        {draft.references.map((reference, index) => (
                          <option key={reference.id} value={reference.id}>
                            {index + 1}. {reference.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button className="source-preview" disabled={!source} onClick={() => setSourceEditor(true)}>
                      {source ? <AssetImage entry={source} thumbnail /> : <span>{t("missing")}</span>}
                      <span>
                        <BoundingBoxIcon />
                        {t("pickSource")}
                      </span>
                    </button>
                    {source && selected.source && (
                      <RectFields
                        value={selected.source}
                        width={source.asset.width}
                        height={source.asset.height}
                        onChange={(value) =>
                          update(selected.id, {
                            source: value,
                            ...(operation(selected) === "anchor" ? { target: value } : {}),
                          })
                        }
                      />
                    )}
                  </section>
                )}
              </div>
            ) : (
              <div className="region-selection-empty">
                <BoundingBoxIcon size={28} />
                <span>{t("drawRegionHint")}</span>
              </div>
            )}
          </div>
        </ResizablePanel>
        <div className="layout-stage">
          <div className="layout-background-toolbar">
            <label>
              {t("backgroundImage")}
              <select value={background} onChange={(event) => setBackground(event.target.value)}>
                <option value="">{t("noBackground")}</option>
                {draft.references.map((reference) => (
                  <option key={reference.id} value={reference.id}>
                    {reference.name}
                  </option>
                ))}
              </select>
            </label>
            {background && (
              <label className="opacity-control">
                {t("opacity")}
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={opacity}
                  onChange={(event) => setOpacity(Number(event.target.value))}
                />
              </label>
            )}
          </div>
          <RegionCanvas
            {...frame}
            background={backgroundEntry?.path}
            opacity={opacity}
            boxes={regions.flatMap((region, index) => {
              const value = region.target;
              return value ? [{ id: region.id, value, color: regionColors[index % regionColors.length] }] : [];
            })}
            selected={selected?.id}
            onSelect={setSelection}
            onChange={changeRectangle}
            onCreate={add}
          />
        </div>
      </div>
      {sourceEditor && selected && source && (
        <SourceEditor
          entry={source}
          value={selected.source ?? [0, 0, 1000, 1000]}
          onClose={() => setSourceEditor(false)}
          onApply={(value) => {
            update(selected.id, { source: value, ...(operation(selected) === "anchor" ? { target: value } : {}) });
            setSourceEditor(false);
          }}
        />
      )}
    </Dialog>
  );
}
