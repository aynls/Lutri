export const palettes = [
  { id: "sand", label: "themeSand" },
  { id: "neutral", label: "themeNeutral" },
  { id: "mist", label: "themeMist" },
  { id: "celadon", label: "themeCeladon" },
] as const;

export const accents = [
  { id: "clay", label: "accentClay" },
  { id: "graphite", label: "accentGraphite" },
  { id: "indigo", label: "accentIndigo" },
  { id: "moss", label: "accentMoss" },
  { id: "amber", label: "accentAmber" },
  { id: "teal", label: "accentTeal" },
  { id: "violet", label: "accentViolet" },
  { id: "rose", label: "accentRose" },
] as const;

export type Palette = (typeof palettes)[number]["id"];
export type Accent = (typeof accents)[number]["id"];
export function applyAppearance(palette: Palette = "sand", accent: Accent = "clay", fontScale = 1) {
  const root = document.documentElement;
  root.dataset.palette = palette;
  root.dataset.accent = accent;
  root.style.setProperty("--font-scale", String(fontScale));
}
