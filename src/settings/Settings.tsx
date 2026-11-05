import { useEffect, useState } from "react";
import { McpSettings } from "./McpSettings";
import { t } from "../i18n";
import { providerNames } from "../models/shared";
import type { ProviderId } from "../models/types";
import { native } from "../services/native";
import { savePreferences, useApplication } from "../services/store";

export function Settings({ onError }: { onError: (error: unknown) => void }) {
  const { preferences } = useApplication();
  const [provider, setProvider] = useState<ProviderId>("bfl"),
    [secret, setSecret] = useState(""),
    [present, setPresent] = useState(false);
  useEffect(() => {
    setSecret("");
    void native<boolean>("credential_present", { provider }).then(setPresent).catch(onError);
  }, [provider, onError]);
  const attempt = (action: () => Promise<unknown>) => void action().catch(onError);
  return (
    <div className="settings-page">
      <section>
        <h2>{t("provider")}</h2>
        <select value={provider} onChange={(e) => setProvider(e.target.value as ProviderId)}>
          {Object.entries(providerNames).map(([id, name]) => (
            <option value={id} key={id}>
              {name}
            </option>
          ))}
        </select>
        <p className="muted">{t(present ? "connected" : "notConnected")}</p>
        <label>
          {t("key")}
          <input type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} />
        </label>
        <div className="button-row">
          <button
            disabled={!secret}
            onClick={() =>
              attempt(async () => {
                await native("credential_save", { provider, secret });
                setSecret("");
                setPresent(true);
              })
            }
          >
            {t("save")}
          </button>
          <button
            disabled={!present}
            onClick={() =>
              attempt(async () => {
                await native("credential_remove", { provider });
                setPresent(false);
              })
            }
          >
            {t("delete")}
          </button>
        </div>
        {(["endpoint", "deployment"] as const)
          .filter((field) =>
            field === "deployment"
              ? provider === "azure"
              : ["azure", "qwencloud", "ark", "byteplus"].includes(provider),
          )
          .map((field) => (
            <label key={`${provider}:${field}`}>
              {t(field)}
              <input
                defaultValue={preferences.providers[provider]?.[field] ?? ""}
                onBlur={(e) =>
                  attempt(() =>
                    savePreferences({
                      ...preferences,
                      providers: {
                        ...preferences.providers,
                        [provider]: { ...preferences.providers[provider], [field]: e.target.value },
                      },
                    }),
                  )
                }
              />
            </label>
          ))}
      </section>
      <section>
        <h2>{t("theme")}</h2>
        <select
          value={preferences.theme}
          onChange={(e) =>
            attempt(() => savePreferences({ ...preferences, theme: e.target.value as typeof preferences.theme }))
          }
        >
          {(["system", "light", "dark"] as const).map((theme) => (
            <option key={theme} value={theme}>
              {t(theme)}
            </option>
          ))}
        </select>
      </section>
      <section>
        <h2>{t("cleanup")}</h2>
        {(["generated", "imported"] as const).map((source) => (
          <div key={source}>
            <label>
              <input
                type="checkbox"
                checked={preferences.cleanup[source].enabled}
                onChange={(e) =>
                  attempt(() =>
                    savePreferences({
                      ...preferences,
                      cleanup: {
                        ...preferences.cleanup,
                        [source]: { ...preferences.cleanup[source], enabled: e.target.checked },
                      },
                    }),
                  )
                }
              />
              {t(source)}
            </label>
            <input
              aria-label={t("capacity")}
              type="number"
              min={30}
              step={1}
              value={preferences.cleanup[source].capacity}
              onChange={(e) => {
                const capacity = Number(e.target.value);
                if (Number.isInteger(capacity) && capacity >= 30)
                  attempt(() =>
                    savePreferences({
                      ...preferences,
                      cleanup: { ...preferences.cleanup, [source]: { ...preferences.cleanup[source], capacity } },
                    }),
                  );
              }}
            />
          </div>
        ))}
      </section>
      <McpSettings onError={onError} />
    </div>
  );
}
