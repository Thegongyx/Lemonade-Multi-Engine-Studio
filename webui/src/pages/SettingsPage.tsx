import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Save, Plug, Sun, Moon, TreePine, Film } from "lucide-react";
import { api } from "../api";

export default function SettingsPage() {
  const { t } = useTranslation();
  const [apiKey, setApiKey] = useState(localStorage.getItem("apiKey") || "lemonade");
  const [baseUrl, setBaseUrl] = useState(localStorage.getItem("serverBaseUrl") || "");
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "light");
  const [testMsg, setTestMsg] = useState("");
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const save = () => {
    localStorage.setItem("apiKey", apiKey.trim() || "lemonade");
    localStorage.setItem("serverBaseUrl", baseUrl.trim());
    localStorage.setItem("theme", theme);
    document.documentElement.setAttribute("data-theme", theme);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const test = async () => {
    setTesting(true);
    setTestMsg("");
    try {
      const h = await api.health();
      setTestMsg(`${t("settings.connected")} · ${(h as { version?: string }).version || ""}`);
    } catch (e) {
      setTestMsg(`${t("settings.failed")}: ${String(e)}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <h2>{t("settings.title")}</h2>
        <p>{t("settings.desc")}</p>
      </div>

      <div className="card">
        <label className="field">
          <span>{t("settings.apiKey")}</span>
          <input
            className="mono"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="lemonade"
          />
          <div className="hint">{t("settings.apiKeyHint")}</div>
        </label>

        <label className="field">
          <span>{t("settings.baseUrl")}</span>
          <input
            className="mono"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="http://localhost:13310"
          />
          <div className="hint">{t("settings.baseUrlHint")}</div>
        </label>

        <label className="field">
          <span>{t("settings.theme")}</span>
          <div className="row">
            <button className={`btn sm${theme === "light" ? " primary" : ""}`} onClick={() => setTheme("light")}>
              <Sun size={14} /> {t("settings.light")}
            </button>
            <button className={`btn sm${theme === "dark" ? " primary" : ""}`} onClick={() => setTheme("dark")}>
              <Moon size={14} /> {t("settings.dark")}
            </button>
            <button className={`btn sm${theme === "nordic" ? " primary" : ""}`} onClick={() => setTheme("nordic")}>
              <TreePine size={14} /> {t("settings.nordic")}
            </button>
            <button className={`btn sm${theme === "film" ? " primary" : ""}`} onClick={() => setTheme("film")}>
              <Film size={14} /> {t("settings.film")}
            </button>
          </div>
        </label>

        <div className="row between" style={{ marginTop: 8 }}>
          <button className="btn" onClick={test} disabled={testing}>
            <Plug size={15} /> {t("settings.test")}
          </button>
          <div className="row">
            {testMsg && <span className="mono">{testMsg}</span>}
            <button className="btn primary" onClick={save}>
              <Save size={15} /> {saved ? t("common.copied") : t("common.save")}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
