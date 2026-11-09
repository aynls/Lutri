import { useState } from "react";
import type { GalleryEntry } from "../domain/types";
import { Dialog } from "../components/Dialog";
import { t } from "../i18n";
import { Gallery } from "./Gallery";
import { ImageViewer } from "./ImageViewer";

export function AssetPicker({
  onSelect,
  onClose,
  onError,
  limit,
  stagedImports,
}: {
  onSelect: (entries: GalleryEntry[]) => void;
  onClose: () => void;
  onError: (error: unknown) => void;
  limit?: number;
  stagedImports: boolean;
}) {
  const [viewing, setViewing] = useState<{ id: string; ids: string[] }>();
  return (
    <>
      <Dialog title={t("chooseImages")} onClose={onClose} className="asset-picker">
        <Gallery
          picker
          stagedImports={stagedImports}
          limit={limit}
          onPick={onSelect}
          onReference={(entry) => onSelect([entry])}
          onView={(id, ids = [id]) => setViewing({ id, ids: ids.includes(id) ? ids : [id] })}
          onError={onError}
        />
      </Dialog>
      {viewing && (
        <ImageViewer
          initialId={viewing.id}
          items={viewing.ids.map((id) => ({ id, assetId: id }))}
          onClose={() => setViewing(undefined)}
          readOnly
        />
      )}
    </>
  );
}
