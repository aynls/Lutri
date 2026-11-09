import { useState } from "react";
import { FolderPlusIcon } from "@phosphor-icons/react";
import type { GalleryEntry } from "../domain/types";
import { t } from "../i18n";
import { Dialog } from "../components/Dialog";
import { Select } from "../components/Select";
import { commit, native } from "../services/native";
import { getState, refreshGallery, updateState, useApplication } from "../services/store";

export function BoardAction({ entry, disabled }: { entry: GalleryEntry; disabled?: boolean }) {
  const { boards } = useApplication();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const duplicate = boards.some((board) => board.name === name.trim());
  const add = async () => {
    setBusy(true);
    setError("");
    try {
      let boardId = selected;
      if (selected === "new") {
        const board = { id: crypto.randomUUID(), name: name.trim() };
        await commit([{ collection: "boards", id: board.id, value: board }]);
        updateState({ boards: [...getState().boards, board] });
        boardId = board.id;
        setSelected(board.id);
      }
      await native("gallery_mutate", { ids: [entry.asset.id], action: "board", value: boardId });
      await refreshGallery([entry.asset.id]);
      setOpen(false);
    } catch (value) {
      setError(String(value));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button
        disabled={disabled}
        title={t("addToBoard")}
        aria-label={t("addToBoard")}
        onClick={() => {
          setSelected(boards[0]?.id ?? "new");
          setName("");
          setError("");
          setOpen(true);
        }}
      >
        <FolderPlusIcon />
      </button>
      {open && (
        <Dialog
          title={t("addToBoard")}
          className="compact-dialog"
          onClose={() => !busy && setOpen(false)}
          footer={
            <>
              <button disabled={busy} onClick={() => setOpen(false)}>
                {t("cancel")}
              </button>
              <button
                className="primary-button"
                disabled={busy || !selected || (selected === "new" && (!name.trim() || duplicate))}
                onClick={() => void add()}
              >
                {t("save")}
              </button>
            </>
          }
        >
          <div className="board-editor">
            <Select aria-label={t("boards")} value={selected} onValueChange={setSelected} disabled={busy}>
              {boards.map((board) => (
                <option key={board.id} value={board.id}>
                  {board.name}
                </option>
              ))}
              <option value="new">{t("newBoard")}</option>
            </Select>
            {selected === "new" && (
              <label>
                {t("boardName")}
                <input
                  autoFocus
                  maxLength={100}
                  value={name}
                  aria-invalid={duplicate || undefined}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
            )}
            {duplicate && selected === "new" && <small className="field-error error-text">{t("boardNameTaken")}</small>}
            {error && (
              <p className="error-text" role="alert">
                {error}
              </p>
            )}
          </div>
        </Dialog>
      )}
    </>
  );
}
