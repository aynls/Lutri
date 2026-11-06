import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { label, localize, localePreference, setLocale, type LocalePreference } from "../i18n";
import { native, readRecords } from "./native";
import { connection, startMcp, stopMcp } from "./mcp";
import { flushWrites, getState, refreshGallery, savePreferences, updateState, type Preferences } from "./store";

export function desktopLabels() {
  return {
    openLabel: localize(label("Open Lutri", "打开 Lutri", "Lutri を開く")),
    quitLabel: localize(label("Quit", "退出", "終了")),
  };
}
export async function selectLocale(choice: LocalePreference) {
  setLocale(choice);
  await emit("locale-changed", choice);
  const desktop = getState().preferences.desktop;
  await native("desktop_configure", {
    background: desktop?.background ?? false,
    launchAtLogin: desktop?.launchAtLogin ?? false,
    ...desktopLabels(),
  });
}

export async function setZoom(zoom: number) {
  const value = Math.max(0.5, Math.min(2, Math.round(zoom * 10) / 10));
  await native("desktop_zoom", { zoom: value });
  localStorage.setItem("lutri.zoom", String(value));
  const current = getState().preferences;
  await savePreferences({
    ...current,
    desktop: { background: false, launchAtLogin: false, ...current.desktop, zoom: value },
  });
  localStorage.setItem("lutri.zoom", String(value));
}

export async function initializeDesktop(onError: (error: unknown) => void) {
  const exitListener = await listen("desktop-exit-request", () => {
    void (async () => {
      try {
        await flushWrites();
        if (connection) await stopMcp();
      } finally {
        await native("desktop_shutdown");
      }
    })().catch(onError);
  });
  const preferences = getState().preferences;
  setLocale(localePreference());
  const localeListener = await listen<LocalePreference>("locale-changed", ({ payload }) => setLocale(payload));
  const preferenceListener = await listen<{ source: string }>("preferences-changed", ({ payload }) => {
    if (payload.source === getCurrentWindow().label) return;
    void readRecords<Preferences>("preferences")
      .then((records) => {
        if (records[0]) updateState({ preferences: records[0] });
      })
      .catch(onError);
  });
  let assetTimer: ReturnType<typeof setTimeout> | undefined;
  const assetListener = await listen<{ source: string }>("assets-changed", ({ payload }) => {
    if (payload.source === getCurrentWindow().label) return;
    clearTimeout(assetTimer);
    assetTimer = setTimeout(() => void refreshGallery().catch(onError), 80);
  });
  await native("desktop_zoom", { zoom: preferences.desktop?.zoom ?? 1 }).catch(onError);
  await native("desktop_configure", {
    background: preferences.desktop?.background ?? false,
    launchAtLogin: preferences.desktop?.launchAtLogin ?? false,
    ...desktopLabels(),
  }).catch(onError);
  await native("upscale_configure", { concurrency: preferences.upscale?.concurrency ?? 1 }).catch(onError);
  if (preferences.mcp?.autoStart && !connection) await startMcp(preferences.mcp.port).catch(onError);
  const keyboard = (event: KeyboardEvent) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.isComposing) return;
    if (!["+", "=", "-", "0"].includes(event.key)) return;
    event.preventDefault();
    const zoom = Number(localStorage.getItem("lutri.zoom")) || getState().preferences.desktop?.zoom || 1;
    void setZoom(event.key === "0" ? 1 : zoom + (event.key === "-" ? -0.1 : 0.1)).catch(onError);
  };
  window.addEventListener("keydown", keyboard);
  return () => {
    localeListener();
    preferenceListener();
    exitListener();
    assetListener();
    clearTimeout(assetTimer);
    window.removeEventListener("keydown", keyboard);
  };
}
