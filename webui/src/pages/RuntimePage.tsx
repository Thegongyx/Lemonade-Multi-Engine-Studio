import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw, Copy } from "lucide-react";
import { api } from "../api";

type LoadedEntry = { model_name?: string; backend_url?: string; status?: string; loaded?: boolean };

export default function RuntimePage() {
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState<LoadedEntry[]>([]);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const load = () => {
    api
      .health()
      .then((r) => {
        const v = r.all_models_loaded;
        const arr = Array.isArray(v) ? v : v ? [v] : [];
        setLoaded(arr as LoadedEntry[]);
      })
      .catch((e) => setError(String(e)));
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, []);

  const endpoint = `${location.origin}/v1`;
  const copy = async () => {
    await navigator.clipboard.writeText(endpoint);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const portOf = (u?: string) => {
    if (!u) return "—";
    const m = u.match(/:(\d+)/);
    return m ? m[1] : u;
  };

  return (
    <>
      <div className="page-head">
        <h2>{t("runtime.title")}</h2>
        <p>{t("runtime.desc")}</p>
      </div>

      <div className="card">
        <div className="row between">
          <div>
            <div className="hint" style={{ marginBottom: 4 }}>{t("runtime.openai")}</div>
            <code className="mono" style={{ fontSize: 13, color: "var(--text)" }}>{endpoint}</code>
          </div>
          <button className="btn sm" onClick={copy}>
            <Copy size={14} /> {copied ? t("common.copied") : t("common.copy")}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="row between" style={{ marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>{t("runtime.running")}</h3>
          <button className="btn sm" onClick={load}>
            <RefreshCw size={14} /> {t("common.refresh")}
          </button>
        </div>
        {error && <div className="tag err">{error}</div>}
        {loaded.length === 0 && <div className="hint">{t("runtime.none")}</div>}
        {loaded.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>{t("models.model")}</th>
                <th>{t("runtime.port")}</th>
                <th>{t("common.status")}</th>
              </tr>
            </thead>
            <tbody>
              {loaded.map((m) => (
                <tr key={m.model_name || m.backend_url}>
                  <td><strong>{m.model_name || "—"}</strong></td>
                  <td className="mono">{portOf(m.backend_url)}</td>
                  <td>{m.status === "ready" || m.loaded ? <span className="tag ok">{t("runtime.running")}</span> : <span className="tag">{m.status || "—"}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
