import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw, Copy, Save } from "lucide-react";
import { api } from "../api";

type LoadedEntry = { model_name?: string; backend_url?: string; status?: string; loaded?: boolean };

type FieldType = "int" | "float" | "bool" | "text" | "select";

type Field = {
  key: string; // config key, dots allowed ("llamacpp.args")
  group: "concurrency" | "inference" | "network" | "storage";
  type: FieldType;
  options?: string[];
  restart?: boolean;
};

// P0 concurrency/resource, P1 inference defaults, P2 network/service, P3 download/storage.
// ctx_size is deliberately absent: it is configured per model.
const FIELDS: Field[] = [
  { key: "max_loaded_models", group: "concurrency", type: "int" },
  { key: "auto_evict", group: "concurrency", type: "bool" },
  { key: "auto_evict_threshold_pct", group: "concurrency", type: "float" },
  { key: "global_timeout", group: "inference", type: "int" },
  { key: "llamacpp.args", group: "inference", type: "text" },
  { key: "llamacpp.backend", group: "inference", type: "select", options: ["auto", "rocm", "vulkan", "cpu", "cuda"] },
  { key: "port", group: "network", type: "int", restart: true },
  { key: "host", group: "network", type: "text", restart: true },
  { key: "websocket_port", group: "network", type: "text", restart: true },
  { key: "broadcast", group: "network", type: "bool", restart: true },
  { key: "allowed_origins", group: "network", type: "text" },
  { key: "offline", group: "network", type: "bool" },
  { key: "default_model_source", group: "storage", type: "select", options: ["huggingface", "modelscope"] },
  { key: "models_dir", group: "storage", type: "text" },
  { key: "download_rate_limit", group: "storage", type: "text" },
  { key: "auto_check_model_updates", group: "storage", type: "bool" },
  { key: "auto_update_models", group: "storage", type: "bool" },
];

const GROUPS: Field["group"][] = ["concurrency", "inference", "network", "storage"];

type Json = Record<string, unknown>;

function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const k of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Json)[k];
  }
  return cur;
}

function setPath(target: Json, path: string, value: unknown): void {
  const parts = path.split(".");
  let cur: Json = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const next = cur[parts[i]];
    if (next === null || typeof next !== "object") cur[parts[i]] = {};
    cur = cur[parts[i]] as Json;
  }
  cur[parts[parts.length - 1]] = value;
}

const toText = (v: unknown): string => (v === undefined || v === null ? "" : String(v));

// Numeric-looking text stays a number (ports accept both "auto" and 13311).
function coerce(f: Field, raw: string): unknown {
  const v = raw.trim();
  if (f.type === "bool") return v === "true";
  if (f.type === "int") return v === "" ? null : Number.parseInt(v, 10);
  if (f.type === "float") return v === "" ? null : Number.parseFloat(v);
  if (f.type === "text" && /^\d+$/.test(v)) return Number.parseInt(v, 10);
  return v;
}

export default function RuntimePage() {
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState<LoadedEntry[]>([]);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const [cfg, setCfg] = useState<Json>({});
  const [defaults, setDefaults] = useState<Json>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  const notify = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2500);
  };

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

  const loadConfig = () => {
    api
      .config()
      .then((r) => {
        setCfg(r);
        setDraft(Object.fromEntries(FIELDS.map((f) => [f.key, toText(getPath(r, f.key))])));
      })
      .catch((e) => setError(String(e)));
    api.configDefaults().then(setDefaults).catch(() => {});
  };

  useEffect(() => {
    load();
    loadConfig();
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, []);

  const dirty = useMemo(
    () => FIELDS.some((f) => draft[f.key] !== toText(getPath(cfg, f.key))),
    [draft, cfg],
  );

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const changes: Json = {};
      for (const f of FIELDS) setPath(changes, f.key, coerce(f, draft[f.key] ?? ""));
      await api.setConfig(changes);
      notify(t("runtime.savedSettings"));
      loadConfig();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const reset = () => setDraft(Object.fromEntries(FIELDS.map((f) => [f.key, toText(getPath(cfg, f.key))])));

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

  const label = (f: Field) => t(`runtime.fields.${f.key.replace(/\./g, "_")}`);

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

      <div className="card">
        <div className="row between" style={{ marginBottom: 4 }}>
          <h3 style={{ margin: 0 }}>{t("runtime.settings")}</h3>
          <div className="row">
            <button className="btn sm" onClick={reset} disabled={!dirty || saving}>
              <RefreshCw size={14} /> {t("common.cancel")}
            </button>
            <button className="btn sm primary" onClick={save} disabled={saving}>
              <Save size={14} /> {t("runtime.saveSettings")}
            </button>
          </div>
        </div>
        <div className="hint" style={{ marginBottom: 10 }}>{t("runtime.settingsHint")}</div>

        {GROUPS.map((g) => (
          <div key={g} className="cfg-group">
            <div className="cfg-group-title">{t(`runtime.group_${g}`)}</div>
            {FIELDS.filter((f) => f.group === g).map((f) => {
              const def = toText(getPath(defaults, f.key));
              const value = draft[f.key] ?? "";
              return (
                <div className="cfg-row" key={f.key}>
                  <div className="cfg-label">
                    <code className="mono">{f.key}</code>
                    {f.restart && <span className="tag warn" style={{ marginLeft: 6 }}>{t("runtime.restart")}</span>}
                    <div className="hint">{label(f)}</div>
                  </div>
                  <div className="cfg-input">
                    {f.type === "bool" || f.type === "select" ? (
                      <select value={value} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}>
                        {(f.type === "bool" ? ["true", "false"] : f.options ?? []).map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="mono"
                        value={value}
                        placeholder={def}
                        onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                      />
                    )}
                    <div className="hint">{t("runtime.default")}: {def === "" ? "—" : def}</div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
