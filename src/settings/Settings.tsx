import { useEffect, useState } from "react";
import { McpSettings } from "./McpSettings";
import { localePreference, t, useLocale, type LocalePreference } from "../i18n";
import { providerNames } from "../models/shared";
import type { ProviderId } from "../models/types";
import { native } from "../services/native";
import { getState, savePreferences, useApplication, type Preferences } from "../services/store";
import { desktopLabels, selectLocale, setZoom } from "../services/desktop";
import { settingsText as text } from "./messages";
import { StorageSettings } from "./StorageSettings";
import "./settings.css";

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
      </summary>
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
      <div className="button-row">
        <button
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
      {!["openrouter", "google"].includes(provider) && <small className="muted">{text("unsupported")}</small>}
      {(["endpoint", "deployment"] as const)
        .filter((field) =>
          field === "deployment" ? provider === "azure" : ["azure", "qwencloud", "ark", "byteplus"].includes(provider),
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
    </details>
  );
}

export function Settings({ onError }: { onError: (error: unknown) => void }) {
  useLocale();
  const { preferences } = useApplication();
  useEffect(() => {
    const provider = sessionStorage.getItem("lutri.settings.provider");
    sessionStorage.removeItem("lutri.settings.provider");
    if (provider) {
      const section = document.getElementById(`provider-${provider}`);
      if (section instanceof HTMLDetailsElement) {
        section.open = true;
        section.scrollIntoView({ block: "center" });
        section.querySelector<HTMLInputElement>("input")?.focus();
      }
    }
  }, []);
  const [devices, setDevices] = useState<{ index: number; name: string }[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const attempt = (action: () => Promise<unknown>) => void action().catch(onError);
  const save = (next: Partial<Preferences>) => savePreferences({ ...getState().preferences, ...next });
  const desktop = { background: false, launchAtLogin: false, zoom: 1, ...preferences.desktop };
  const upscale = { concurrency: 1, gpuIndex: null as number | null, ...preferences.upscale };
  const refreshDevices = () => {
    setLoadingDevices(true);
    void native<typeof devices>("upscale_devices")
      .then(setDevices)
      .catch(onError)
      .finally(() => setLoadingDevices(false));
  };
  const configureDesktop = async (next: Partial<typeof desktop>) => {
    const value = { ...desktop, ...next };
    if (!value.background) value.launchAtLogin = false;
    await native("desktop_configure", { ...value, ...desktopLabels() });
    await save({ desktop: value });
  };
  return (
    <div className="settings-page">
      <section>
        <h2>{text("appearance")}</h2>
        <div className="settings-row">
          <span>{t("theme")}</span>
          <div className="segmented-control">
            {(["system", "light", "dark"] as const).map((theme) => (
              <button
                key={theme}
                aria-pressed={preferences.theme === theme}
                onClick={() => attempt(() => save({ theme }))}
              >
                {t(theme)}
              </button>
            ))}
          </div>
        </div>
        <label className="settings-row">
          <span>{text("language")}</span>
          <select
            value={localePreference()}
            onChange={(event) => attempt(() => selectLocale(event.target.value as LocalePreference))}
          >
            <option value="system">{t("system")}</option>
            <option value="zh">中文</option>
            <option value="en">English</option>
            <option value="ja">日本語</option>
          </select>
        </label>
        <label className="settings-row">
          <span>{text("zoom")}</span>
          <select value={desktop.zoom} onChange={(event) => attempt(() => setZoom(Number(event.target.value)))}>
            {Array.from({ length: 16 }, (_, index) => (index + 5) / 10).map((value) => (
              <option key={value} value={value}>
                {Math.round(value * 100)}%
              </option>
            ))}
          </select>
        </label>
      </section>
      <section>
        <h2>{t("provider")}</h2>
        {(Object.keys(providerNames) as ProviderId[]).map((provider) => (
          <ProviderSettings key={provider} provider={provider} onError={onError} />
        ))}
      </section>
      <StorageSettings onError={onError} />
      <section>
        <h2>{t("cleanup")}</h2>
        {(["generated", "imported"] as const).map((source) => (
          <div key={source} className="cleanup-setting">
            <label className="settings-row">
              <span>{t(source)}</span>
              <input
                type="checkbox"
                checked={preferences.cleanup[source].enabled}
                onChange={(event) =>
                  attempt(() =>
                    save({
                      cleanup: {
                        ...getState().preferences.cleanup,
                        [source]: { ...getState().preferences.cleanup[source], enabled: event.target.checked },
                      },
                    }),
                  )
                }
              />
            </label>
            <label className="settings-row">
              <span>{t("capacity")}</span>
              <input
                type="number"
                min={30}
                step={1}
                defaultValue={preferences.cleanup[source].capacity}
                onBlur={(event) => {
                  const capacity = Number(event.target.value);
                  if (Number.isInteger(capacity) && capacity >= 30)
                    attempt(() =>
                      save({
                        cleanup: {
                          ...getState().preferences.cleanup,
                          [source]: { ...getState().preferences.cleanup[source], capacity },
                        },
                      }),
                    );
                  else event.target.value = String(preferences.cleanup[source].capacity);
                }}
              />
            </label>
          </div>
        ))}
      </section>
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
          <span>{text("gpu")}</span>
          <select
            value={upscale.gpuIndex ?? "auto"}
            onFocus={() => {
              if (!devices.length && !loadingDevices) refreshDevices();
            }}
            onChange={(event) =>
              attempt(() =>
                save({
                  upscale: { ...upscale, gpuIndex: event.target.value === "auto" ? null : Number(event.target.value) },
                }),
              )
            }
          >
            <option value="auto">{t("automatic")}</option>
            {upscale.gpuIndex !== null && !devices.some((device) => device.index === upscale.gpuIndex) && (
              <option value={upscale.gpuIndex}>GPU {upscale.gpuIndex}</option>
            )}
            {devices.map((device) => (
              <option key={device.index} value={device.index}>
                {device.name}
              </option>
            ))}
          </select>
        </label>
        <button disabled={loadingDevices} onClick={refreshDevices}>
          {text("refresh")}
        </button>
      </section>
      <section>
        <h2>{text("desktop")}</h2>
        <label className="settings-row">
          <span>{text("background")}</span>
          <input
            type="checkbox"
            checked={desktop.background}
            onChange={(event) => attempt(() => configureDesktop({ background: event.target.checked }))}
          />
        </label>
        <label className="settings-row">
          <span>{text("login")}</span>
          <input
            type="checkbox"
            checked={desktop.launchAtLogin}
            disabled={!desktop.background}
            onChange={(event) => attempt(() => configureDesktop({ launchAtLogin: event.target.checked }))}
          />
        </label>
      </section>
      <McpSettings onError={onError} />
    </div>
  );
}
