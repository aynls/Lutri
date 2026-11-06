import { useId, useState } from "react";
import { CaretDownIcon, CheckIcon } from "@phosphor-icons/react";
import { Dialog } from "../components/Dialog";
import { label, localize, t } from "../i18n";
import type { UpscaleModel } from "./catalog";

// Descriptions follow the official Real-ESRGAN model zoo and Real-CUGAN README.
const descriptions = {
  "realesr-general-x4v3": label(
    "For everyday photos and general images. Fast and light on GPU memory, making it a useful choice for batches; denoising and deblurring are relatively gentle.",
    "适合日常照片与通用图像。速度快、显存占用低，适合批量处理；降噪和去模糊能力较温和，重度噪点或模糊图像可尝试 x4plus。",
    "日常の写真や汎用画像向け。高速で GPU メモリの使用量が少なく、一括処理に適しています。ノイズやぼけの除去は控えめで、劣化が強い画像には x4plus も候補です。",
  ),
  "realesrgan-x4plus": label(
    "For photos, scenery, and textured images. Restores details in low-resolution images; compared with General, its larger model takes more processing time and GPU memory.",
    "适合照片、风景和纹理丰富的图像，用于修复低清图像的纹理与细节。模型比 General 更大，处理耗时和显存开销也更高。",
    "写真や風景、質感の豊かな画像向け。低解像度画像の質感や細部を復元します。General よりモデルが大きく、処理時間と GPU メモリを多く使います。",
  ),
  "realesrgan-x4plus-anime": label(
    "For anime, illustrations, and drawn images. Smaller than the general x4plus model and optimized for anime; pronounced sharpening may alter fine lines or soft-focus areas.",
    "适合动漫、插画等绘画图像，模型比通用 x4plus 更小。针对动漫内容优化，锐化较明显，细线条和刻意虚化的区域可能发生变化。",
    "アニメやイラストなどの描画画像向け。汎用 x4plus より小型で、アニメに最適化されています。シャープ化が強めで、細い線や意図的なぼけが変わる場合があります。",
  ),
  "realcugan-pro": label(
    "For anime and illustrations, with an emphasis on preserving lines and textures. Choose no denoising for clean images, conservative processing to retain the original look, or strong denoising for noisy images.",
    "适合动漫与插画，注重线条和纹理保留。干净图像可关闭降噪，想保留原有画风可选保守模式，噪点或压缩痕迹较多时可选强降噪。",
    "アニメやイラスト向けで、線と質感の保持を重視。きれいな画像はノイズ除去なし、元の画風を保つなら控えめ、ノイズや圧縮劣化が目立つ画像には強いノイズ除去を選べます。",
  ),
};

export function UpscaleModelSelector({
  models,
  value,
  disabled,
  onChange,
}: {
  models: UpscaleModel[];
  value: string;
  disabled: boolean;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const labelId = useId();
  const active = models.find((entry) => entry.id === value);
  return (
    <div className="upscale-model-select">
      <span id={labelId}>{t("model")}</span>
      <button
        type="button"
        className="model-trigger"
        disabled={disabled || !models.length}
        aria-labelledby={labelId + " " + labelId + "-value"}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span id={labelId + "-value"}>
          <strong>{active?.name ?? "—"}</strong>
        </span>
        <CaretDownIcon aria-hidden="true" />
      </button>
      {open && (
        <Dialog title={t("model")} className="upscale-model-dialog" onClose={() => setOpen(false)}>
          <div className="model-options">
            {models.map((entry) => {
              const description = descriptions[entry.id as keyof typeof descriptions];
              const selected = entry.id === value;
              return (
                <button
                  type="button"
                  key={entry.id}
                  className={selected ? "selected" : ""}
                  aria-pressed={selected}
                  autoFocus={selected}
                  disabled={disabled}
                  onClick={() => {
                    onChange(entry.id);
                    setOpen(false);
                  }}
                >
                  <span>
                    <strong>{entry.name}</strong>
                    {description && <small>{localize(description)}</small>}
                  </span>
                  {selected && <CheckIcon aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </Dialog>
      )}
    </div>
  );
}
