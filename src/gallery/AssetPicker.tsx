import type { GalleryEntry } from "../domain/types";
import { Dialog } from "../components/Dialog";
import { t } from "../i18n";
import { Gallery } from "./Gallery";

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
  return (
    <Dialog title={t("chooseImages")} onClose={onClose} className="asset-picker">
      <Gallery
        picker
        stagedImports={stagedImports}
        limit={limit}
        onPick={onSelect}
        onReference={(entry) => onSelect([entry])}
        onView={() => {}}
        onRelated={() => {}}
        onError={onError}
      />
    </Dialog>
  );
}
