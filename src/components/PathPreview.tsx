import { useEffect, useState } from "react";
import { imageUrl } from "../services/native";
import { t } from "../i18n";
import { ImageStage, type PreviewImage } from "./ImageStage";

export function PathPreview({
  before,
  after,
  toolbarTarget,
}: {
  before: string;
  after?: string;
  toolbarTarget?: HTMLElement | null;
}) {
  const [images, setImages] = useState<PreviewImage[]>(),
    [error, setError] = useState(false);
  useEffect(() => {
    let disposed = false;
    setImages(undefined);
    setError(false);
    void Promise.all(
      [before, ...(after ? [after] : [])].map(async (path) => {
        const image = new Image();
        image.src = imageUrl(path);
        await image.decode();
        return { dataUrl: image.src, width: image.naturalWidth, height: image.naturalHeight };
      }),
    )
      .then((value) => {
        if (!disposed) setImages(value);
      })
      .catch(() => {
        if (!disposed) setError(true);
      });
    return () => {
      disposed = true;
    };
  }, [before, after]);
  return images ? (
    <ImageStage before={images[0]} after={images[1]} toolbarTarget={toolbarTarget} />
  ) : (
    <div className="empty-state">{error ? t("missing") : <span className="spinner" />}</div>
  );
}
