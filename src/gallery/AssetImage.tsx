import { useEffect, useState } from "react";
import type { GalleryEntry } from "../domain/types";
import { t } from "../i18n";
import { assetExists, imageUrl } from "../services/native";

export function AssetImage({ entry, thumbnail = false }: { entry: GalleryEntry; thumbnail?: boolean }) {
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let active = true;
    void assetExists(entry.asset.id)
      .then((exists) => {
        if (active) setMissing(!exists);
      })
      .catch(() => {
        if (active) setMissing(true);
      });
    return () => {
      active = false;
    };
  }, [entry.asset.id, entry.path]);
  return missing ? (
    <span className="missing-image">{t("missing")}</span>
  ) : (
    <img
      loading="lazy"
      decoding="async"
      src={imageUrl(thumbnail ? entry.thumbnailPath : entry.path)}
      alt={entry.asset.id}
      onError={() => setMissing(true)}
    />
  );
}
