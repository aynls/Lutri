import { Select } from "../components/Select";
import { Fragment, useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import { confirm } from "@tauri-apps/plugin-dialog";
import {
  HeartIcon,
  PlusIcon,
  MinusIcon,
  UploadSimpleIcon,
  FunnelSimpleIcon,
  DotsThreeIcon,
  MagnifyingGlassIcon,
  CheckIcon,
} from "@phosphor-icons/react";
import type { GalleryEntry } from "../domain/types";
import { isSvgAsset } from "../domain/media";
import { t } from "../i18n";
import { commit, importAsset, native } from "../services/native";
import { AssetImage } from "./AssetImage";
import { getState, refreshGallery, updateState, useApplication } from "../services/store";
import { Dialog } from "../components/Dialog";
import { CopyButton } from "../components/CopyButton";
import { ResizablePanel } from "../components/ResizablePanel";
import { chooseImages, copyAssetImage, deleteImage, exportImages, favorite } from "./actions";
import { lt } from "../i18n/library";
export { chooseImages, favorite } from "./actions";

export function Gallery({
  onView,
  onReference,
  onEdit,
  onRelated,
  onUpscale,
  onError,
  picker = false,
  stagedImports = false,
  onPick,
  limit = Infinity,
}: {
  onView: (id: string, ids?: string[]) => void;
  onReference: (entry: GalleryEntry) => void;
  onEdit?: (entry: GalleryEntry) => void;
  onRelated: (id: string) => void;
  onUpscale?: (entry: GalleryEntry) => void;
  onError: (error: unknown) => void;
  picker?: boolean;
  stagedImports?: boolean;
  onPick?: (entries: GalleryEntry[]) => void;
  limit?: number;
}) {
  const { gallery, boards } = useApplication();
  const [filter, setFilter] = useState("all"),
    [search, setSearch] = useState("");
  const [batchSelection, setBatchSelection] = useState(false);
  const selecting = picker || batchSelection;
  const [selected, setSelected] = useState<string[]>([]),
    [sort, setSort] = useState("newest");
  const [filters, setFilters] = useState(false),
    [from, setFrom] = useState(""),
    [until, setUntil] = useState("");
  const [orientation, setOrientation] = useState("all"),
    [size, setSize] = useState(190);
  const masonry = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const [boardEditor, setBoardEditor] = useState<{ id?: string; name: string }>();
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const anchor = useRef<string>(undefined);
  const [entries, setEntries] = useState<GalleryEntry[]>([]),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setAvailableWidth(entry.contentRect.width));
    observer.observe(masonry.current!);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const dismiss = (event: Event) => {
      for (const menu of document.querySelectorAll<HTMLDetailsElement>(".action-menu[open]"))
        if (!(event.target instanceof Node) || !menu.contains(event.target)) menu.removeAttribute("open");
    };
    document.addEventListener("click", dismiss, true);
    document.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("click", dismiss, true);
      document.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, []);
  const layout = useMemo(() => {
    const gap = 16;
    const width = Math.min(size, availableWidth || size);
    const columnCount = Math.max(1, Math.floor((availableWidth + gap) / (width + gap)));
    const heights = Array<number>(columnCount).fill(0);
    let previousDay: string | null = null;
    const cards = entries.map((entry) => {
      const day = sort === "size" ? null : new Date(entry.addedAt).toDateString();
      let headingTop: number | undefined;
      if (day !== null && day !== previousDay) {
        headingTop = Math.max(...heights);
        heights.fill(headingTop + 32);
      }
      previousDay = day;
      const column = heights.indexOf(Math.min(...heights));
      const top = heights[column];
      const ratio = entry.asset.width > 0 && entry.asset.height > 0 ? entry.asset.width / entry.asset.height : 1;
      // Card padding and the card/image borders take 12px on each axis.
      heights[column] += Math.max(0, width - 12) / ratio + 12 + gap;
      return { top, left: column * (width + gap), ratio, headingTop };
    });
    return { cards, width, height: Math.max(0, ...heights) - (entries.length ? gap : 0) };
  }, [entries, sort, size, availableWidth]);
  const [kind, setKind] = useState("all"),
    [model, setModel] = useState("all"),
    [provider, setProvider] = useState("all"),
    [tag, setTag] = useState(""),
    [availability, setAvailability] = useState("all");
  const [facets, setFacets] = useState<{
    model: string[];
    provider: string[];
    tags: string[];
    counts: Record<string, number>;
  }>({ model: [], provider: [], tags: [], counts: {} });
  const [editor, setEditor] = useState<{ kind: "url" | "tag" | "rename-tag"; value: string }>();
  const cache = useRef(new Map<string, GalleryEntry>()),
    version = useRef(0);
  const query = useMemo(
    () => ({
      collection: filter,
      search,
      sort,
      from: from ? new Date(`${from}T00:00:00`).getTime() : undefined,
      until: until ? new Date(`${until}T00:00:00`).getTime() + 86400000 : undefined,
      orientation,
      kind,
      model,
      provider,
      tag,
      availability,
    }),
    [filter, search, sort, from, until, orientation, kind, model, provider, tag, availability],
  );
  const queryKey = JSON.stringify(query);
  useEffect(() => {
    setSelected([]);
    setEntries([]);
    anchor.current = undefined;
  }, [queryKey]);
  useEffect(() => {
    const current = ++version.current;
    setLoading(true);
    void Promise.all([
      native<{ entries: GalleryEntry[]; total: number }>("gallery_query", { query, limit: 80, offset: 0 }),
      native<typeof facets>("gallery_facets"),
      selected.length ? native<string[]>("gallery_ids", { query: { ...query, ids: selected } }) : Promise.resolve([]),
    ])
      .then(([page, options, matching]) => {
        if (current !== version.current) return;
        for (const entry of page.entries) cache.current.set(entry.asset.id, entry);
        setEntries(page.entries);
        setTotal(page.total);
        setFacets(options);
        setSelected((previous) => previous.filter((id) => matching.includes(id)));
      })
      .catch(onError)
      .finally(() => {
        if (current === version.current) setLoading(false);
      });
    return () => {
      version.current++;
    };
  }, [queryKey, gallery]);
  const loadMore = async () => {
    const current = version.current;
    setLoading(true);
    try {
      const page = await native<{ entries: GalleryEntry[]; total: number }>("gallery_query", {
        query,
        limit: 80,
        offset: entries.length,
      });
      if (current !== version.current) return;
      for (const entry of page.entries) cache.current.set(entry.asset.id, entry);
      setEntries((previous) => [
        ...previous,
        ...page.entries.filter((entry) => !previous.some((old) => old.asset.id === entry.asset.id)),
      ]);
      setTotal(page.total);
    } finally {
      if (current === version.current) setLoading(false);
    }
  };
  const selection = selected;
  const selectedEntries = selection
    .map((id) => cache.current.get(id))
    .filter((entry): entry is GalleryEntry => !!entry);
  const selectAllMatches = async () => {
    const current = version.current;
    const ids = (await native<string[]>("gallery_ids", { query })).slice(0, limit);
    const records = await native<GalleryEntry[]>("gallery_entries", { ids });
    if (current !== version.current) return;
    for (const entry of records) cache.current.set(entry.asset.id, entry);
    setSelected(records.map((entry) => entry.asset.id));
  };
  const view = async (id: string) => {
    onView(id, await native<string[]>("gallery_ids", { query }));
  };
  const board = boards.find((entry) => entry.id === filter);
  const duplicateBoardName = boards.some(
    (entry) => entry.id !== boardEditor?.id && entry.name === boardEditor?.name.trim(),
  );
  const attempt = (action: () => Promise<unknown>) => {
    setBusy(true);
    setNotice("");
    void action()
      .catch(onError)
      .finally(() => setBusy(false));
  };
  const positionMenu = (details: HTMLDetailsElement) => {
    const menu = details.querySelector<HTMLElement>(":scope > div");
    if (!menu) return;
    for (const other of document.querySelectorAll<HTMLDetailsElement>(".action-menu[open]"))
      if (other !== details) other.removeAttribute("open");
    const margin = 8,
      gap = 4,
      rect = details.getBoundingClientRect(),
      above = rect.top - margin,
      below = window.innerHeight - rect.bottom - margin,
      up = above >= menu.offsetHeight + gap || above > below,
      left = Math.max(margin, Math.min(rect.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - margin)),
      top = Math.max(
        margin,
        Math.min(
          up ? rect.top - menu.offsetHeight - gap : rect.bottom + gap,
          window.innerHeight - menu.offsetHeight - margin,
        ),
      );
    menu.style.cssText = `position: fixed; left: ${left}px; right: auto; top: ${top}px; bottom: auto; max-height: ${window.innerHeight - margin * 2}px; overflow-y: auto;`;
  };
  const toggleMenu = (event: SyntheticEvent<HTMLElement>) => {
    event.preventDefault();
    const details = event.currentTarget.closest("details");
    if (!details) return;
    details.open = !details.open;
    if (details.open) positionMenu(details);
  };
  const placeMenu = (event: SyntheticEvent<HTMLDetailsElement>) => {
    const details = event.currentTarget;
    if (details.open) positionMenu(details);
    else details.querySelector(":scope > div")?.removeAttribute("style");
  };
  const toggle = (id: string, range = false) => {
    if (limit === 0 || loading || busy) return;
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
  const mutateEntries = async (action: string, value: string) => {
    await native("gallery_mutate", { ids: selection, action, value });
    await refreshGallery();
  };
  const deleteEntry = async (entry: GalleryEntry) => {
    if (await deleteImage(entry)) setSelected((previous) => previous.filter((id) => id !== entry.asset.id));
  };
  const deleteSelected = async () => {
    if (!(await confirm(t("confirmDelete"), { title: "Lutri", kind: "warning" }))) return;
    const failed: string[] = [];
    try {
      for (const entry of selectedEntries) {
        try {
          await native("asset_delete", { id: entry.asset.id });
        } catch (error) {
          failed.push(`${entry.asset.id}: ${String(error)}`);
        }
      }
    } finally {
      await refreshGallery();
      setSelected([]);
    }
    if (failed.length) throw new Error(failed.join("\n"));
  };
  const importImages = async () => {
    const imported = await chooseImages(stagedImports);
    if (picker && imported.length) onPick ? onPick(imported.slice(0, limit)) : onReference(imported[0]);
    else if (imported.length) setNotice(`${t("importedCount")} · ${imported.length}`);
  };
  const saveBoard = async () => {
    if (!boardEditor?.name.trim() || duplicateBoardName) return;
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
    const ids = await native<string[]>("gallery_ids", { query: { collection: board.id } });
    await native("gallery_mutate", { ids, action: "unboard", value: board.id });
    await commit([{ collection: "boards", id: board.id }]);
    updateState({ boards: getState().boards.filter((entry) => entry.id !== board.id) });
    setFilter("all");
    setSelected([]);
    await refreshGallery();
  };
  return (
    <div className="gallery-workspace">
      <ResizablePanel className="library-sidebar" storageKey="lutri.gallery.sidebar" initialWidth={280}>
        <div className="library-nav">
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
              <span>{facets.counts?.[id] ?? 0}</span>
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
              <small>{facets.counts?.[entry.id] ?? 0}</small>
            </button>
          ))}
        </div>
      </ResizablePanel>
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
          <Select aria-label={t("filters")} value={sort} onValueChange={(nextValue) => setSort(nextValue)}>
            <option value="newest">{t("newest")}</option>
            <option value="oldest">{t("oldest")}</option>
            <option value="size">{lt("size")}</option>
          </Select>
          <button aria-pressed={filters} onClick={() => setFilters(!filters)} title={t("filters")}>
            <FunnelSimpleIcon />
          </button>
          <button disabled={busy || limit === 0} onClick={() => attempt(importImages)}>
            <UploadSimpleIcon />
            {t("import")}
          </button>
          <button disabled={busy} onClick={() => setEditor({ kind: "url", value: "" })}>
            {lt("url")}
          </button>
          {board && (
            <details className="action-menu" onToggle={placeMenu}>
              <summary aria-label={t("boards")} onClick={toggleMenu}>
                <DotsThreeIcon size={20} />
              </summary>
              <div onClick={(event) => event.currentTarget.closest("details")?.removeAttribute("open")}>
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
              <Select value={orientation} onValueChange={(nextValue) => setOrientation(nextValue)}>
                {(["all", "landscape", "portrait", "square"] as const).map((value) => (
                  <option key={value} value={value}>
                    {t(value)}
                  </option>
                ))}
              </Select>
            </label>
            {(["kind", "model", "provider", "availability"] as const).map((field) => (
              <label key={field}>
                {field === "model" || field === "provider" ? t(field) : lt(field)}
                <Select
                  value={{ kind, model, provider, availability }[field]}
                  onValueChange={(nextValue) =>
                    ({ kind: setKind, model: setModel, provider: setProvider, availability: setAvailability })[field](
                      nextValue,
                    )
                  }
                >
                  <option value="all">{t("all")}</option>
                  {(field === "kind"
                    ? ["generation", "import", "upscale"]
                    : field === "availability"
                      ? ["available", "missing", "unknown"]
                      : facets[field]
                  ).map((value) => (
                    <option key={value} value={value}>
                      {field === "kind"
                        ? value === "upscale"
                          ? t("upscale")
                          : lt(value as "generation" | "import")
                        : field === "availability"
                          ? value === "missing"
                            ? t("missing")
                            : lt(value as "available" | "unknown")
                          : value}
                    </option>
                  ))}
                </Select>
              </label>
            ))}
            <label>
              {lt("tags")}
              <Select value={tag} onValueChange={(nextValue) => setTag(nextValue)}>
                <option value="">{t("all")}</option>
                {facets.tags.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </Select>
            </label>
            {tag && (
              <>
                <button onClick={() => setEditor({ kind: "rename-tag", value: tag })}>{lt("renameTag")}</button>
                <button
                  onClick={() =>
                    attempt(async () => {
                      if (!(await confirm(t("confirmDelete")))) return;
                      const ids = await native<string[]>("gallery_ids", { query: { tag } });
                      await native("gallery_mutate", { ids, action: "untag", value: tag });
                      setTag("");
                      await refreshGallery();
                    })
                  }
                >
                  {lt("deleteTag")}
                </button>
              </>
            )}
            <button
              onClick={() => {
                setKind("all");
                setModel("all");
                setProvider("all");
                setAvailability("all");
                setTag("");
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
            disabled={busy}
            aria-pressed={batchSelection}
            onClick={() => {
              setBatchSelection(!batchSelection);
              setSelected([]);
              anchor.current = undefined;
            }}
          >
            <CheckIcon />
            {batchSelection ? t("cancel") : t("batchSelect")}
          </button>
          {batchSelection && (
            <>
              <button
                disabled={!entries.length || busy || loading || limit === 0}
                onClick={() => attempt(selectAllMatches)}
              >
                {t("selectAll")}
              </button>
              {!!selection.length && (
                <button disabled={busy} onClick={() => setSelected([])}>
                  {t("deselect")}
                </button>
              )}
            </>
          )}
          <span className="toolbar-spacer" />
          {notice && <span role="status">{notice}</span>}
          <div className="thumbnail-zoom">
            <button
              aria-label={t("zoomOut")}
              title={t("zoomOut")}
              disabled={size <= 130}
              onClick={() => setSize((value) => Math.max(130, value - 10))}
            >
              <MinusIcon />
            </button>
            <input
              className="thumbnail-size"
              type="range"
              min={130}
              max={290}
              value={size}
              aria-label={t("thumbnailSize")}
              onChange={(event) => setSize(Number(event.target.value))}
            />
            <button
              aria-label={t("zoomIn")}
              title={t("zoomIn")}
              disabled={size >= 290}
              onClick={() => setSize((value) => Math.min(290, value + 10))}
            >
              <PlusIcon />
            </button>
          </div>
        </div>
        <div className="gallery-scroll">
          <div className="gallery-masonry" ref={masonry} style={{ height: layout.height }}>
            {entries.map((entry, index) => {
              const position = layout.cards[index];
              return (
                <Fragment key={entry.asset.id}>
                  {position.headingTop !== undefined && (
                    <h3 className="gallery-date" style={{ top: position.headingTop }}>
                      {new Date(entry.addedAt).toLocaleDateString()}
                    </h3>
                  )}
                  <article
                    className={`gallery-card ${selection.includes(entry.asset.id) ? "is-selected" : ""}`}
                    style={{ top: position.top, left: position.left, width: layout.width }}
                  >
                    <div className="gallery-image">
                      <button
                        className="image-button"
                        style={{ aspectRatio: position.ratio }}
                        aria-label={entry.asset.id}
                        onClick={(event) => {
                          if (selecting) toggle(entry.asset.id, event.shiftKey);
                          else attempt(() => view(entry.asset.id));
                        }}
                      >
                        <AssetImage entry={entry} thumbnail />
                      </button>
                      {selecting && (
                        <input
                          type="checkbox"
                          aria-label={entry.asset.id}
                          checked={selection.includes(entry.asset.id)}
                          onChange={() => toggle(entry.asset.id)}
                        />
                      )}
                      <button
                        className="favorite"
                        title={entry.favorite ? t("removeFavorite") : t("favorites")}
                        onClick={() => attempt(() => favorite(entry))}
                      >
                        <HeartIcon weight={entry.favorite ? "fill" : "regular"} />
                      </button>
                    </div>
                    {!picker && (
                      <div className="gallery-actions">
                        <button onClick={() => onReference(entry)}>{t("useReference")}</button>
                        <details className="action-menu" onToggle={placeMenu}>
                          <summary aria-label={t("details")} onClick={toggleMenu}>
                            <DotsThreeIcon size={20} />
                          </summary>
                          <div onClick={(event) => event.currentTarget.closest("details")?.removeAttribute("open")}>
                            <button onClick={() => attempt(() => view(entry.asset.id))}>{t("details")}</button>
                            {onEdit && <button onClick={() => onEdit(entry)}>{lt("edit")}</button>}
                            <button onClick={() => attempt(() => copyAssetImage(entry.asset.id))}>
                              {lt("copyImage")}
                            </button>
                            {onUpscale && (
                              <button
                                disabled={isSvgAsset(entry.asset)}
                                title={isSvgAsset(entry.asset) ? t("svgUpscaleUnsupported") : undefined}
                                onClick={() => onUpscale(entry)}
                              >
                                {t("upscale")}
                              </button>
                            )}
                            <button onClick={() => onRelated(entry.asset.id)}>{t("related")}</button>
                            <button onClick={() => attempt(() => exportImages([entry]))}>{t("saveAs")}</button>
                            <CopyButton value={entry.asset.id} label={t("copyId")} onError={onError} />
                            <button className="danger-button" onClick={() => attempt(() => deleteEntry(entry))}>
                              {t("delete")}
                            </button>
                          </div>
                        </details>
                      </div>
                    )}
                  </article>
                </Fragment>
              );
            })}
          </div>
          {entries.length < total && (
            <button disabled={loading || busy} onClick={() => attempt(loadMore)}>
              {lt("more")}
            </button>
          )}
          {!entries.length && !loading && (
            <div className="empty-state">
              <p>{gallery.some((entry) => !entry.staged && !entry.unlisted) ? t("noMatches") : t("empty")}</p>
              <button onClick={() => attempt(importImages)}>
                <PlusIcon />
                {t("import")}
              </button>
            </div>
          )}
        </div>
        {picker ? (
          <div className="gallery-selection-footer">
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
                  attempt(() => mutateEntries("favorite", String(!selectedEntries.every((value) => value.favorite))))
                }
              >
                {selectedEntries.every((entry) => entry.favorite) ? t("removeFavorite") : t("favorites")}
              </button>
              <Select
                aria-label={t("addToBoard")}
                value=""
                disabled={busy || !boards.length}
                onValueChange={(nextValue) => {
                  const id = nextValue;
                  attempt(() => mutateEntries("board", id));
                }}
              >
                <option value="">{t("addToBoard")}</option>
                {boards.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </Select>
              {board && (
                <button disabled={busy} onClick={() => attempt(() => mutateEntries("unboard", board.id))}>
                  {t("removeFromBoard")}
                </button>
              )}
              <button disabled={busy} onClick={() => setEditor({ kind: "tag", value: "" })}>
                {lt("addTag")}
              </button>
              {tag && (
                <button
                  disabled={busy}
                  onClick={() =>
                    attempt(async () => {
                      await native("gallery_mutate", { ids: selection, action: "untag", value: tag });
                      await refreshGallery();
                    })
                  }
                >
                  {lt("untag")}
                </button>
              )}
              {board && (
                <Select
                  value=""
                  aria-label={lt("move")}
                  disabled={busy}
                  onValueChange={(nextValue) => {
                    const value = nextValue;
                    attempt(async () => {
                      await native("gallery_mutate", { ids: selection, action: "move", value, from: board.id });
                      setSelected([]);
                      await refreshGallery();
                    });
                  }}
                >
                  <option value="">{lt("move")}</option>
                  {boards
                    .filter((value) => value.id !== board.id)
                    .map((value) => (
                      <option key={value.id} value={value.id}>
                        {value.name}
                      </option>
                    ))}
                </Select>
              )}
              <span className="toolbar-spacer" />
              <button className="danger-button" disabled={busy} onClick={() => attempt(deleteSelected)}>
                {t("delete")}
              </button>
            </div>
          )
        )}
      </div>
      {editor && (
        <Dialog
          title={editor.kind === "url" ? lt("url") : editor.kind === "rename-tag" ? lt("renameTag") : lt("addTag")}
          className="compact-dialog"
          onClose={() => setEditor(undefined)}
          footer={
            <>
              <button onClick={() => setEditor(undefined)}>{t("cancel")}</button>
              <button
                disabled={busy || !editor.value.trim()}
                onClick={() =>
                  attempt(async () => {
                    if (editor.kind === "url") {
                      const url = new URL(editor.value.trim());
                      if (!["https:", "http:"].includes(url.protocol)) throw new Error(lt("invalidUrl"));
                      const entry = await importAsset({ url: url.href }, stagedImports);
                      if (picker) onPick?.([entry]);
                    } else {
                      const ids =
                        editor.kind === "rename-tag"
                          ? await native<string[]>("gallery_ids", { query: { tag } })
                          : selection;
                      await native("gallery_mutate", {
                        ids,
                        action: editor.kind === "rename-tag" ? "rename-tag" : "tag",
                        value: editor.value.trim(),
                        from: editor.kind === "rename-tag" ? tag : undefined,
                      });
                      if (editor.kind === "rename-tag") setTag(editor.value.trim());
                    }
                    setEditor(undefined);
                    await refreshGallery();
                  })
                }
              >
                {t("save")}
              </button>
            </>
          }
        >
          <input
            autoFocus
            aria-label={editor.kind === "url" ? "URL" : lt("tagName")}
            value={editor.value}
            onChange={(event) => setEditor({ ...editor, value: event.target.value })}
          />
        </Dialog>
      )}
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
                disabled={busy || !boardEditor.name.trim() || duplicateBoardName}
                onClick={() => attempt(saveBoard)}
              >
                {t("save")}
              </button>
            </>
          }
        >
          <form
            className="board-editor"
            onSubmit={(event) => {
              event.preventDefault();
              attempt(saveBoard);
            }}
          >
            <label>
              {t("boardName")}
              <input
                autoFocus
                aria-invalid={duplicateBoardName || undefined}
                aria-describedby={duplicateBoardName ? "board-name-error" : undefined}
                maxLength={100}
                value={boardEditor.name}
                onChange={(event) => setBoardEditor({ ...boardEditor, name: event.target.value })}
              />
            </label>
            {duplicateBoardName && (
              <small className="field-error error-text" id="board-name-error" role="alert">
                {t("boardNameTaken")}
              </small>
            )}
          </form>
        </Dialog>
      )}
    </div>
  );
}
