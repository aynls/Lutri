import { Fragment, useMemo, useRef, useState } from "react";
import { confirm } from "@tauri-apps/plugin-dialog";
import {
  HeartIcon,
  PlusIcon,
  UploadSimpleIcon,
  FunnelSimpleIcon,
  DotsThreeIcon,
  MagnifyingGlassIcon,
  CheckIcon,
} from "@phosphor-icons/react";
import type { GalleryEntry } from "../domain/types";
import { t } from "../i18n";
import { commit, native } from "../services/native";
import { AssetImage } from "./AssetImage";
import { getState, refreshGallery, updateState, useApplication } from "../services/store";
import { Dialog } from "../components/Dialog";
import { CopyButton } from "../components/CopyButton";
import { chooseImages, exportImages, favorite } from "./actions";
export { chooseImages, favorite } from "./actions";

export function Gallery({
  onView,
  onReference,
  onRelated,
  onUpscale,
  onError,
  picker = false,
  onPick,
  limit = Infinity,
}: {
  onView: (id: string) => void;
  onReference: (entry: GalleryEntry) => void;
  onRelated: (id: string) => void;
  onUpscale?: (entry: GalleryEntry) => void;
  onError: (error: unknown) => void;
  picker?: boolean;
  onPick?: (entries: GalleryEntry[]) => void;
  limit?: number;
}) {
  const { gallery, boards } = useApplication();
  const [filter, setFilter] = useState("all"),
    [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]),
    [sort, setSort] = useState("newest");
  const [filters, setFilters] = useState(false),
    [from, setFrom] = useState(""),
    [until, setUntil] = useState("");
  const [orientation, setOrientation] = useState("all"),
    [size, setSize] = useState(190);
  const [boardEditor, setBoardEditor] = useState<{ id?: string; name: string }>();
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const anchor = useRef<string>(undefined);
  const entries = useMemo(() => {
    const start = from ? new Date(`${from}T00:00:00`).getTime() : -Infinity;
    const end = until ? new Date(`${until}T00:00:00`) : undefined;
    end?.setDate(end.getDate() + 1);
    const query = search.trim().toLowerCase();
    return gallery
      .filter(
        (entry) =>
          (filter === "all" ||
            (filter === "favorites" && entry.favorite) ||
            entry.source === filter ||
            entry.boardIds.includes(filter)) &&
          (entry.asset.id.includes(query) || entry.asset.name.toLowerCase().includes(query)) &&
          entry.addedAt >= start &&
          entry.addedAt < (end?.getTime() ?? Infinity) &&
          (orientation === "all" ||
            (orientation === "square" && entry.asset.width === entry.asset.height) ||
            (orientation === "landscape" && entry.asset.width > entry.asset.height) ||
            (orientation === "portrait" && entry.asset.width < entry.asset.height)),
      )
      .sort((a, b) =>
        sort === "name"
          ? a.asset.name.localeCompare(b.asset.name)
          : sort === "oldest"
            ? a.addedAt - b.addedAt
            : b.addedAt - a.addedAt,
      );
  }, [gallery, filter, search, from, until, orientation, sort]);
  const visibleIds = new Set(entries.map((entry) => entry.asset.id));
  const selection = selected.filter((id) => visibleIds.has(id));
  const selectedEntries = selection.map((id) => entries.find((entry) => entry.asset.id === id)!);
  const board = boards.find((entry) => entry.id === filter);
  const attempt = (action: () => Promise<unknown>) => {
    setBusy(true);
    setNotice("");
    void action()
      .catch(onError)
      .finally(() => setBusy(false));
  };
  const toggle = (id: string, range = false) => {
    if (limit === 0) return;
    const a = entries.findIndex((entry) => entry.asset.id === anchor.current),
      b = entries.findIndex((entry) => entry.asset.id === id);
    if (range && a >= 0) {
      const ids = entries.slice(Math.min(a, b), Math.max(a, b) + 1).map((entry) => entry.asset.id);
      setSelected([...new Set([...selection, ...ids])].slice(0, limit));
    } else
      setSelected(
        selection.includes(id) ? selection.filter((value) => value !== id) : [...selection, id].slice(-limit),
      );
    anchor.current = id;
  };
  const mutateEntries = async (transform: (entry: GalleryEntry) => GalleryEntry) => {
    await commit(
      selectedEntries.map((entry) => ({ collection: "gallery", id: entry.asset.id, value: transform(entry) })),
    );
    await refreshGallery();
  };
  const deleteSelected = async () => {
    if (!(await confirm(t("confirmDelete"), { title: "Lutri", kind: "warning" }))) return;
    const failed: string[] = [];
    try {
      for (const entry of selectedEntries) {
        try {
          await native("asset_delete", { id: entry.asset.id });
        } catch (error) {
          failed.push(`${entry.asset.name}: ${String(error)}`);
        }
      }
    } finally {
      await refreshGallery();
      setSelected([]);
    }
    if (failed.length) throw new Error(failed.join("\n"));
  };
  const importImages = async () => {
    const imported = await chooseImages();
    if (picker && imported.length) onPick ? onPick(imported.slice(0, limit)) : onReference(imported[0]);
    else if (imported.length) setNotice(`${t("importedCount")} · ${imported.length}`);
  };
  const saveBoard = async () => {
    if (!boardEditor?.name.trim()) return;
    const value = { id: boardEditor.id ?? crypto.randomUUID(), name: boardEditor.name.trim() };
    await commit([{ collection: "boards", id: value.id, value }]);
    const current = getState().boards;
    updateState({
      boards: boardEditor.id ? current.map((entry) => (entry.id === value.id ? value : entry)) : [...current, value],
    });
    setBoardEditor(undefined);
    setFilter(value.id);
    setSelected([]);
  };
  const deleteBoard = async () => {
    if (!board || !(await confirm(t("deleteBoardNotice"), { title: t("deleteBoard"), kind: "warning" }))) return;
    await commit([
      { collection: "boards", id: board.id },
      ...gallery
        .filter((entry) => entry.boardIds.includes(board.id))
        .map((entry) => ({
          collection: "gallery",
          id: entry.asset.id,
          value: { ...entry, boardIds: entry.boardIds.filter((id) => id !== board.id) },
        })),
    ]);
    updateState({ boards: getState().boards.filter((entry) => entry.id !== board.id) });
    setFilter("all");
    setSelected([]);
    await refreshGallery();
  };
  return (
    <div className="gallery-workspace">
      <aside className="library-sidebar">
        {(["all", "generated", "imported", "favorites"] as const).map((id) => (
          <button
            className={filter === id ? "selected" : ""}
            key={id}
            onClick={() => {
              setFilter(id);
              setSelected([]);
            }}
          >
            {t(id)}
            <span>
              {
                gallery.filter((entry) => id === "all" || entry.source === id || (id === "favorites" && entry.favorite))
                  .length
              }
            </span>
          </button>
        ))}
        <div className="section-heading">
          <span>{t("boards")}</span>
          <button title={t("newBoard")} onClick={() => setBoardEditor({ name: "" })}>
            <PlusIcon />
          </button>
        </div>
        {boards.map((entry) => (
          <button
            className={filter === entry.id ? "selected" : ""}
            key={entry.id}
            onClick={() => {
              setFilter(entry.id);
              setSelected([]);
            }}
          >
            <span className="board-name">{entry.name}</span>
            <small>{gallery.filter((image) => image.boardIds.includes(entry.id)).length}</small>
          </button>
        ))}
      </aside>
      <div className="gallery-content">
        <div className="content-toolbar gallery-toolbar">
          <div className="search-input">
            <MagnifyingGlassIcon />
            <input
              aria-label={t("searchImages")}
              placeholder={t("searchImages")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <select aria-label={t("filters")} value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="newest">{t("newest")}</option>
            <option value="oldest">{t("oldest")}</option>
            <option value="name">{t("nameOrder")}</option>
          </select>
          <button aria-pressed={filters} onClick={() => setFilters(!filters)} title={t("filters")}>
            <FunnelSimpleIcon />
          </button>
          <button disabled={busy || limit === 0} onClick={() => attempt(importImages)}>
            <UploadSimpleIcon />
            {t("import")}
          </button>
          {board && (
            <details className="action-menu">
              <summary aria-label={t("boards")}>
                <DotsThreeIcon size={20} />
              </summary>
              <div>
                <button onClick={() => setBoardEditor(board)}>{t("rename")}</button>
                <button onClick={() => attempt(deleteBoard)}>{t("deleteBoard")}</button>
              </div>
            </details>
          )}
        </div>
        {filters && (
          <div className="filter-bar">
            <label>
              {t("fromDate")}
              <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </label>
            <label>
              {t("toDate")}
              <input type="date" min={from} value={until} onChange={(event) => setUntil(event.target.value)} />
            </label>
            <label>
              {t("orientation")}
              <select value={orientation} onChange={(event) => setOrientation(event.target.value)}>
                {(["all", "landscape", "portrait", "square"] as const).map((value) => (
                  <option key={value} value={value}>
                    {t(value)}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={() => {
                setFrom("");
                setUntil("");
                setOrientation("all");
                setSearch("");
              }}
            >
              {t("reset")}
            </button>
          </div>
        )}
        <div className="selection-toolbar">
          <button
            disabled={!entries.length || busy}
            onClick={() =>
              setSelected(
                selection.length === Math.min(entries.length, limit)
                  ? []
                  : entries.slice(0, limit).map((entry) => entry.asset.id),
              )
            }
          >
            <CheckIcon />
            {selection.length ? `${t("selectedCount")} ${selection.length}` : t("selectAll")}
          </button>
          {!!selection.length && <button onClick={() => setSelected([])}>{t("deselect")}</button>}
          <span className="toolbar-spacer" />
          {notice && <span role="status">{notice}</span>}
          <span className="muted">{entries.length}</span>
          <input
            className="thumbnail-size"
            type="range"
            min={130}
            max={290}
            value={size}
            aria-label={t("zoomIn")}
            onChange={(event) => setSize(Number(event.target.value))}
          />
        </div>
        <div className="gallery-scroll">
          <div className="gallery-grid" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${size}px, 1fr))` }}>
            {entries.map((entry, index) => {
              const day = sort === "name" ? null : new Date(entry.addedAt).toDateString();
              const newDay =
                day !== null && (index === 0 || new Date(entries[index - 1].addedAt).toDateString() !== day);
              return (
                <Fragment key={entry.asset.id}>
                  {newDay ? <h3 className="gallery-date">{new Date(entry.addedAt).toLocaleDateString()}</h3> : null}
                  <article className={`gallery-card ${selection.includes(entry.asset.id) ? "is-selected" : ""}`}>
                    <div className="gallery-image">
                      <button
                        className="image-button"
                        title={entry.asset.name}
                        onClick={(event) => {
                          if (picker || event.ctrlKey || event.metaKey || event.shiftKey || selection.length)
                            toggle(entry.asset.id, event.shiftKey);
                          else onView(entry.asset.id);
                        }}
                      >
                        <AssetImage entry={entry} thumbnail />
                      </button>
                      <input
                        type="checkbox"
                        aria-label={entry.asset.name}
                        checked={selection.includes(entry.asset.id)}
                        onChange={() => toggle(entry.asset.id)}
                      />
                      <button
                        className="favorite"
                        title={entry.favorite ? t("removeFavorite") : t("favorites")}
                        onClick={() => attempt(() => favorite(entry))}
                      >
                        <HeartIcon weight={entry.favorite ? "fill" : "regular"} />
                      </button>
                    </div>
                    <footer>
                      <span title={entry.asset.name}>{entry.asset.name}</span>
                      <small>
                        {entry.asset.width} × {entry.asset.height}
                      </small>
                    </footer>
                    {!picker && (
                      <div className="gallery-actions">
                        <button onClick={() => onReference(entry)}>{t("useReference")}</button>
                        <details className="action-menu">
                          <summary aria-label={t("details")}>
                            <DotsThreeIcon size={20} />
                          </summary>
                          <div>
                            <button onClick={() => onView(entry.asset.id)}>{t("details")}</button>
                            {onUpscale && <button onClick={() => onUpscale(entry)}>{t("upscale")}</button>}
                            <button onClick={() => onRelated(entry.asset.id)}>{t("related")}</button>
                            <button onClick={() => attempt(() => exportImages([entry]))}>{t("saveAs")}</button>
                            <CopyButton value={entry.asset.id} onError={onError} />
                          </div>
                        </details>
                      </div>
                    )}
                  </article>
                </Fragment>
              );
            })}
          </div>
          {!entries.length && (
            <div className="empty-state">
              <p>{gallery.length ? t("noMatches") : t("empty")}</p>
              <button onClick={() => attempt(importImages)}>
                <PlusIcon />
                {t("import")}
              </button>
            </div>
          )}
        </div>
        {picker ? (
          <div className="gallery-selection-footer">
            <span>
              {t("selectedCount")} · {selection.length}
              {Number.isFinite(limit) ? ` / ${limit}` : ""}
            </span>
            <button
              className="primary-button"
              disabled={!selection.length || busy}
              onClick={() => (onPick ? onPick(selectedEntries) : onReference(selectedEntries[0]))}
            >
              {t("add")}
            </button>
          </div>
        ) : (
          !!selection.length && (
            <div className="gallery-selection-footer">
              <button
                disabled={busy}
                onClick={() =>
                  attempt(async () => {
                    const count = await exportImages(selectedEntries);
                    if (count) setNotice(`${t("exportedCount")} · ${count}`);
                  })
                }
              >
                {t("saveAs")}
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  attempt(() =>
                    mutateEntries((entry) => ({
                      ...entry,
                      favorite: !selectedEntries.every((value) => value.favorite),
                    })),
                  )
                }
              >
                {selectedEntries.every((entry) => entry.favorite) ? t("removeFavorite") : t("favorites")}
              </button>
              <select
                aria-label={t("addToBoard")}
                value=""
                disabled={busy || !boards.length}
                onChange={(event) => {
                  const id = event.target.value;
                  attempt(() =>
                    mutateEntries((entry) => ({ ...entry, boardIds: [...new Set([...entry.boardIds, id])] })),
                  );
                }}
              >
                <option value="">{t("addToBoard")}</option>
                {boards.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
              {board && (
                <button
                  disabled={busy}
                  onClick={() =>
                    attempt(() =>
                      mutateEntries((entry) => ({
                        ...entry,
                        boardIds: entry.boardIds.filter((id) => id !== board.id),
                      })),
                    )
                  }
                >
                  {t("removeFromBoard")}
                </button>
              )}
              <span className="toolbar-spacer" />
              <button className="danger-button" disabled={busy} onClick={() => attempt(deleteSelected)}>
                {t("delete")}
              </button>
            </div>
          )
        )}
      </div>
      {boardEditor && (
        <Dialog
          title={boardEditor.id ? t("rename") : t("newBoard")}
          className="compact-dialog"
          onClose={() => setBoardEditor(undefined)}
          footer={
            <>
              <button onClick={() => setBoardEditor(undefined)}>{t("cancel")}</button>
              <button
                className="primary-button"
                disabled={busy || !boardEditor.name.trim()}
                onClick={() => attempt(saveBoard)}
              >
                {t("save")}
              </button>
            </>
          }
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              attempt(saveBoard);
            }}
          >
            <input
              autoFocus
              aria-label={t("nameOrder")}
              maxLength={100}
              value={boardEditor.name}
              onChange={(event) => setBoardEditor({ ...boardEditor, name: event.target.value })}
            />
          </form>
        </Dialog>
      )}
    </div>
  );
}
