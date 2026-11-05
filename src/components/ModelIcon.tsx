const familyIcons: Record<string, { file: string; monochrome?: boolean }> = {
  FLUX: { file: "flux.png", monochrome: true },
  "GPT Image": { file: "openai.png", monochrome: true },
  Qwen: { file: "qwen-color.png" },
  "Nano Banana": { file: "nano-banana.png" },
  Seedream: { file: "seedream.png" },
  Grok: { file: "grok.svg", monochrome: true },
  Recraft: { file: "recraft.svg", monochrome: true },
  Ideogram: { file: "ideogram.svg", monochrome: true },
  MAI: { file: "microsoft-color.svg" },
  Muse: { file: "meta-color.svg" },
};

export function ModelIcon({ family, size = 22 }: { family: string; size?: number }) {
  const icon = familyIcons[family];
  return icon ? (
    <img
      className={`model-icon${icon.monochrome ? " monochrome" : ""}`}
      src={`/models/${icon.file}`}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  ) : null;
}

export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <img className="brand-light" src="/brand/mark.svg" alt="" />
      <img className="brand-dark" src="/brand/mark-dark.svg" alt="" />
    </span>
  );
}
