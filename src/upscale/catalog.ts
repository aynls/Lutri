import { label, localize } from "../i18n";
import { native } from "../services/native";

interface InstalledModel {
  id: string;
  name: string;
  scale: number;
}
export const noiseOptions = [
  { id: "no-denoise", label: label("Off", "关闭", "なし") },
  { id: "conservative", label: label("Conservative", "保守", "控えめ") },
  { id: "denoise3x", label: label("Strong", "强", "強") },
] as const;
export type Noise = (typeof noiseOptions)[number]["id"];
export interface UpscaleModel {
  id: string;
  name: string;
  scales: number[];
  configurations: { scale: number; fileId: string; noise?: Noise }[];
}
const names: Record<string, string> = {
  "realesr-general-x4v3": "Real-ESRGAN General",
  "realesrgan-x4plus": "Real-ESRGAN x4plus",
  "realesrgan-x4plus-anime": "Real-ESRGAN x4plus Anime",
};

// A model is a user-facing choice; weight files implement its scale/noise settings.
export async function loadUpscaleModels(): Promise<UpscaleModel[]> {
  const installed = await native<InstalledModel[]>("upscale_models");
  const ids = new Set(installed.map((model) => model.id));
  const configurations: UpscaleModel["configurations"] = [];
  for (const scale of [2, 3]) {
    for (const { id: noise } of noiseOptions) {
      const fileId = `realcugan-pro-${scale}x-${noise}`;
      if (ids.has(fileId)) configurations.push({ scale, noise, fileId });
    }
  }
  const models: UpscaleModel[] = installed
    .filter((model) => !model.id.startsWith("realcugan-pro-"))
    .map((model) => ({
      id: model.id,
      name: names[model.id] ?? model.name,
      scales: [1, 2, 3, 4],
      configurations: [1, 2, 3, 4].map((scale) => ({ scale, fileId: model.id })),
    }));
  const order = Object.keys(names);
  models.sort((a, b) => {
    const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length);
    return rank(a.id) - rank(b.id) || a.name.localeCompare(b.name);
  });
  if (configurations.length)
    models.push({
      id: "realcugan-pro",
      name: "Real-CUGAN Pro",
      scales: [...new Set(configurations.map((item) => item.scale))],
      configurations,
    });
  return models;
}

export function resolveUpscaleModel(
  models: UpscaleModel[],
  id: string,
  scale: number,
  noise: string = "no-denoise",
): string {
  const model = models.find((item) => item.id === id);
  const configuration = model?.configurations.find(
    (item) => item.scale === scale && (item.noise === undefined || item.noise === noise),
  );
  if (!configuration)
    throw new Error(
      localize(
        label("This upscale configuration is unavailable.", "此超分配置不可用。", "この超解像設定は利用できません。"),
      ),
    );
  return configuration.fileId;
}
