import { Select } from "../components/Select";
import { useEffect, useRef, useState } from "react";
import { accents, palettes } from "../appearance";
import {
  ArrowUpRightIcon,
  ChatCircleTextIcon,
  CaretRightIcon,
  CheckIcon,
  HardDrivesIcon,
  MonitorIcon,
  PlugsIcon,
  SlidersHorizontalIcon,
} from "@phosphor-icons/react";
import { McpSettings } from "./McpSettings";
import { LlmSettings } from "./LlmSettings";
import { localePreference, t, useLocale, type LocalePreference } from "../i18n";
import { lt } from "../i18n/library";
import { maxRequestCount, providerNames } from "../models/shared";
import type { ProviderId } from "../models/types";
import { native } from "../services/native";
import { getState, refreshUpscaleDevices, savePreferences, useApplication, type Preferences } from "../services/store";
import { desktopLabels, selectLocale, setZoom } from "../services/desktop";
import { settingsText as text } from "./messages";
import { StorageSettings } from "./StorageSettings";
import { LocalResourceCleanup } from "./LocalResourceCleanup";
import "./settings.css";

type SettingsCategory = "general" | "providers" | "llm" | "storage" | "upscale" | "mcp";

function ProviderSettings({ provider, onError }: { provider: ProviderId; onError: (error: unknown) => void }) {
  const { preferences } = useApplication();
  const [present, setPresent] = useState(false),
    [secret, setSecret] = useState(""),
    [busy, setBusy] = useState(false),
    [checked, setChecked] = useState(false);
  const endpointRequired = ["azure", "ark", "byteplus"].includes(provider);
  const configured =
    present &&
    (!endpointRequired || !!preferences.providers[provider]?.endpoint?.trim()) &&
    (provider !== "azure" || !!preferences.providers[provider]?.deployment?.trim());
  useEffect(() => {
    void native<boolean>("credential_present", { provider }).then(setPresent).catch(onError);
  }, [provider, onError]);
  const attempt = (action: () => Promise<unknown>) => {
    setBusy(true);
    void action()
      .catch(onError)
      .finally(() => setBusy(false));
  };
  return (
    <details className="provider-setting" id={`provider-${provider}`}>
      <summary>
        <strong>{providerNames[provider]}</strong>
        <span className={configured ? "provider-configured" : "muted"}>
          {text(configured ? "configured" : "unconfigured")}
        </span>
        <CaretRightIcon className="provider-chevron" size={16} aria-hidden="true" />
      </summary>
      <div className="provider-fields">
        <label>
          {t("key")}
          <input
            type="password"
            autoComplete="off"
            value={secret}
            disabled={busy}
            onChange={(event) => setSecret(event.target.value)}
          />
        </label>
        {(["endpoint", "deployment"] as const)
          .filter((field) =>
            field === "deployment"
              ? provider === "azure"
              : ["azure", "qwencloud", "ark", "byteplus"].includes(provider),
          )
          .map((field) => (
            <label key={field}>
              {t(field)}
              <input
                defaultValue={preferences.providers[provider]?.[field] ?? ""}
                onBlur={(event) => {
                  const value = event.target.value.trim();
                  attempt(async () => {
                    const prefs = getState().preferences;
                    await savePreferences({
                      ...prefs,
                      providers: { ...prefs.providers, [provider]: { ...prefs.providers[provider], [field]: value } },
                    });
                    setChecked(false);
                  });
                }}
              />
            </label>
          ))}
        <div className="button-row">
          <button
            className="settings-primary-button"
            disabled={!secret.trim() || busy}
            onClick={() =>
              attempt(async () => {
                await native("credential_save", { provider, secret: secret.trim() });
                setSecret("");
                setPresent(true);
                setChecked(false);
              })
            }
          >
            {t("save")}
          </button>
          <button
            disabled={!present || busy}
            onClick={() =>
              attempt(async () => {
                await native("credential_remove", { provider });
                setPresent(false);
                setChecked(false);
              })
            }
          >
            {t("delete")}
          </button>
          {["openrouter", "google"].includes(provider) && (
            <button
              disabled={!configured || busy}
              onClick={() =>
                attempt(async () => {
                  setChecked(false);
                  await native("credential_check", { provider });
                  setChecked(true);
                })
              }
            >
              {text(busy ? "checking" : "check")}
            </button>
          )}
        </div>
        {checked && <small role="status">{text("checked")}</small>}
      </div>
    </details>
  );
}

export function Settings({ onError, onView }: { onError: (error: unknown) => void; onView: (id: string) => void }) {
  useLocale();
  const { preferences, upscaleDevices: devices, loadingUpscaleDevices: loadingDevices } = useApplication();
  const [requestedProvider] = useState(() => sessionStorage.getItem("lutri.settings.provider"));
  const [category, setCategory] = useState<SettingsCategory>(() =>
    requestedProvider ? "providers" : sessionStorage.getItem("lutri.settings.category") === "llm" ? "llm" : "general",
  );
  const categoryItems = [
    { id: "general", label: text("general"), icon: SlidersHorizontalIcon },
    { id: "providers", label: t("provider"), icon: PlugsIcon },
    { id: "llm", label: "LLM", icon: ChatCircleTextIcon },
    { id: "storage", label: lt("storage"), icon: HardDrivesIcon },
    { id: "upscale", label: t("upscale"), icon: ArrowUpRightIcon },
    { id: "mcp", label: "MCP", icon: MonitorIcon },
  ] as const;
  useEffect(() => {
    sessionStorage.removeItem("lutri.settings.provider");
    sessionStorage.removeItem("lutri.settings.category");
    if (requestedProvider) {
      const section = document.getElementById(`provider-${requestedProvider}`);
      if (section instanceof HTMLDetailsElement) {
        section.open = true;
        section.scrollIntoView({ block: "center" });
        section.querySelector<HTMLInputElement>("input")?.focus();
      }
    }
  }, [requestedProvider]);
  const [maxRequests, setMaxRequests] = useState(maxRequestCount(preferences));
  const [fontScale, setFontScale] = useState(preferences.fontScale ?? 1);
  const fontTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingFontScale = useRef<number | undefined>(undefined);
  const errorHandler = useRef(onError);
  errorHandler.current = onError;
  useEffect(
    () => () => {
      clearTimeout(fontTimer.current);
      if (pendingFontScale.current !== undefined)
        void savePreferences({ ...getState().preferences, fontScale: pendingFontScale.current }).catch(
          errorHandler.current,
        );
    },
    [],
  );
  const attempt = (action: () => Promise<unknown>) => void action().catch(onError);
  const save = (next: Partial<Preferences>) => savePreferences({ ...getState().preferences, ...next });
  const desktop = { background: false, launchAtLogin: false, zoom: 1, ...preferences.desktop };
  const upscale = { concurrency: 1, gpuIndex: null as number | null, ...preferences.upscale };
  const refreshDevices = () => attempt(refreshUpscaleDevices);
  const configureDesktop = async (next: Partial<typeof desktop>) => {
    const value = { ...desktop, ...next };
    if (!value.background) value.launchAtLogin = false;
    await native("desktop_configure", { ...value, ...desktopLabels() });
    await save({ desktop: value });
  };
  return (
    <div className="settings-page">
      <nav className="settings-navigation" aria-label={t("settings")}>
        {categoryItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            id={`settings-nav-${id}`}
            aria-current={category === id ? "page" : undefined}
            aria-controls={`settings-panel-${id}`}
            onClick={() => setCategory(id)}
          >
            <Icon size={18} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="settings-content">
        <div
          className="settings-panel"
          id="settings-panel-general"
          aria-labelledby="settings-nav-general"
          hidden={category !== "general"}
        >
          <section>
            <h2>{text("appearance")}</h2>
            <div className="theme-picker" role="group" aria-labelledby="theme-style-label">
              <span id="theme-style-label">{text("themeStyle")}</span>
              <div className="theme-options">
                {palettes.map(({ id, label }) => (
                  <button
                    key={id}
                    className="theme-option"
                    aria-pressed={(preferences.palette ?? "sand") === id}
                    onClick={() => attempt(() => save({ palette: id }))}
                  >
                    <span className="theme-preview" data-palette={id} aria-hidden="true">
                      <span className="theme-preview-nav">
                        <i />
                        <i />
                        <i />
                      </span>
                      <span className="theme-preview-panel">
                        <span className="theme-preview-heading" />
                        <span className="theme-preview-input" />
                        <span className="theme-preview-action" />
                      </span>
                      <span className="theme-preview-workspace">
                        <span className="theme-preview-image" />
                      </span>
                    </span>
                    <span className="theme-option-label">
                      {text(label)}
                      <CheckIcon size={14} weight="bold" aria-hidden="true" />
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="settings-row">
              <span id="accent-color-label">{text("accentColor")}</span>
              <div className="accent-swatches" role="group" aria-labelledby="accent-color-label">
                {accents.map(({ id: accent, label }) => (
                  <button
                    key={accent}
                    className="accent-swatch"
                    data-accent={accent}
                    title={text(label)}
                    aria-label={text(label)}
                    aria-pressed={(preferences.accent ?? "clay") === accent}
                    onClick={() => attempt(() => save({ accent }))}
                  >
                    <CheckIcon size={14} weight="bold" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
            <label className="settings-row">
              <span>{text("fontSize")}</span>
              <div className="font-size-control">
                <input
                  type="range"
                  min={80}
                  max={140}
                  step={5}
                  value={Math.round(fontScale * 100)}
                  aria-label={text("fontSize")}
                  onChange={(event) => {
                    const value = Number(event.target.value) / 100;
                    setFontScale(value);
                    document.documentElement.style.setProperty("--font-scale", String(value));
                    pendingFontScale.current = value;
                    clearTimeout(fontTimer.current);
                    fontTimer.current = setTimeout(() => {
                      pendingFontScale.current = undefined;
                      void savePreferences({ ...getState().preferences, fontScale: value }).catch(errorHandler.current);
                    }, 250);
                  }}
                />
                <output>{Math.round(fontScale * 100)}%</output>
              </div>
            </label>
            <label className="settings-row">
              <span>{text("language")}</span>
              <Select
                value={localePreference()}
                onValueChange={(nextValue) => attempt(() => selectLocale(nextValue as LocalePreference))}
              >
                <option value="system">{t("system")}</option>
                <option value="zh">中文</option>
                <option value="en">English</option>
                <option value="ja">日本語</option>
              </Select>
            </label>
            <label className="settings-row">
              <span>{text("zoom")}</span>
              <Select value={desktop.zoom} onValueChange={(nextValue) => attempt(() => setZoom(Number(nextValue)))}>
                {Array.from({ length: 16 }, (_, index) => (index + 5) / 10).map((value) => (
                  <option key={value} value={value}>
                    {Math.round(value * 100)}%
                  </option>
                ))}
              </Select>
            </label>
          </section>
          <section>
            <h2>{text("desktop")}</h2>
            <label className="settings-row">
              <span>{text("background")}</span>
              <input
                type="checkbox"
                role="switch"
                checked={desktop.background}
                onChange={(event) => attempt(() => configureDesktop({ background: event.target.checked }))}
              />
            </label>
            <label className="settings-row">
              <span>{text("login")}</span>
              <input
                type="checkbox"
                role="switch"
                checked={desktop.launchAtLogin}
                disabled={!desktop.background}
                onChange={(event) => attempt(() => configureDesktop({ launchAtLogin: event.target.checked }))}
              />
            </label>
          </section>
          <section>
            <h2>{text("generation")}</h2>
            <label className="settings-row">
              <span>{text("maxRequests")}</span>
              <input
                type="number"
                min={1}
                step={1}
                value={maxRequests}
                onBlur={() => {
                  if (Number.isInteger(maxRequests) && maxRequests >= 1)
                    attempt(() => save({ generation: { maxRequestCount: maxRequests } }));
                  else setMaxRequests(maxRequestCount(preferences));
                }}
                onChange={(event) => setMaxRequests(Number(event.target.value))}
              />
            </label>
          </section>
        </div>
        <div
          className="settings-panel"
          id="settings-panel-providers"
          aria-labelledby="settings-nav-providers"
          hidden={category !== "providers"}
        >
          <section>
            <h2>{t("provider")}</h2>
            {(Object.keys(providerNames) as ProviderId[]).map((provider) => (
              <ProviderSettings key={provider} provider={provider} onError={onError} />
            ))}
          </section>
        </div>
        <div
          className="settings-panel"
          id="settings-panel-llm"
          aria-labelledby="settings-nav-llm"
          hidden={category !== "llm"}
        >
          <LlmSettings onError={onError} />
        </div>
        <div
          className="settings-panel"
          id="settings-panel-storage"
          aria-labelledby="settings-nav-storage"
          hidden={category !== "storage"}
        >
          <StorageSettings onError={onError} />
          <LocalResourceCleanup onError={onError} onView={onView} />
        </div>
        <div
          className="settings-panel"
          id="settings-panel-upscale"
          aria-labelledby="settings-nav-upscale"
          hidden={category !== "upscale"}
        >
          <section>
            <h2>{t("upscale")}</h2>
            <label className="settings-row">
              <span>{text("concurrency")}</span>
              <input
                type="number"
                min={1}
                max={16}
                step={1}
                defaultValue={upscale.concurrency}
                onBlur={(event) => {
                  const concurrency = Number(event.target.value);
                  if (Number.isInteger(concurrency) && concurrency >= 1 && concurrency <= 16)
                    attempt(async () => {
                      await native("upscale_configure", { concurrency });
                      await save({ upscale: { ...upscale, concurrency } });
                    });
                  else event.target.value = String(upscale.concurrency);
                }}
              />
            </label>
            <label className="settings-row">
              <span>{text("device")}</span>
              <Select
                value={upscale.gpuIndex ?? "auto"}
                onValueChange={(nextValue) =>
                  attempt(() =>
                    save({
                      upscale: {
                        ...upscale,
                        gpuIndex: nextValue === "auto" ? null : Number(nextValue),
                      },
                    }),
                  )
                }
              >
                <option value="auto">{t("automatic")}</option>
                <option value={-1}>{text("cpuFallback")}</option>
                {upscale.gpuIndex !== null &&
                  upscale.gpuIndex >= 0 &&
                  !devices.some((device) => device.index === upscale.gpuIndex) && (
                    <option value={upscale.gpuIndex}>
                      {loadingDevices ? text("loadingDevices") : `${text("device")} ${upscale.gpuIndex}`}
                    </option>
                  )}
                {devices.map((device) => (
                  <option key={device.index} value={device.index}>
                    {device.name}
                  </option>
                ))}
              </Select>
            </label>
            <button disabled={loadingDevices} onClick={refreshDevices}>
              {text("refresh")}
            </button>
          </section>
        </div>
        <div
          className="settings-panel"
          id="settings-panel-mcp"
          aria-labelledby="settings-nav-mcp"
          hidden={category !== "mcp"}
        >
          <McpSettings onError={onError} />
        </div>
      </div>
    </div>
  );
}
