import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw, Copy, Save, Cpu, MemoryStick, HardDrive } from "lucide-react";
import { api, type SystemInfo } from "../api";

type LoadedEntry = { model_name?: string; backend_url?: string; status?: string; loaded?: boolean };

const fmtBytes = (n?: number | null) => {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${n} B`;
};

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
  { key: "llamacpp.engines_dir", group: "storage", type: "text" },
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
  const [sys, setSys] = useState<SystemInfo | null>(null);

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
    api.systemInfo().then(setSys).catch(() => {});
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

  const devices = (sys?.devices ?? {}) as Record<string, any>;
  const cpu = devices.cpu as { name?: string; cores?: number; threads?: number } | undefined;
  const gpus: Array<{ name?: string; vram_gb?: number; virtual_mem_gb?: number; driver_version?: string; family?: string; integrated?: boolean }> = [
    ...(Array.isArray(devices.amd_gpu) ? devices.amd_gpu : []),
    ...(Array.isArray(devices.nvidia_gpu) ? devices.nvidia_gpu : []),
  ];
  const npu = devices.amd_npu as { name?: string; available?: boolean; family?: string; tops_max_int?: number } | undefined;
  const storage = sys?.model_storage as { used_bytes?: number; total_bytes?: number; free_bytes?: number; error?: string } | undefined;

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

      {sys && (
        <div className="card">
          <h3>{t("runtime.hardware")}</h3>
          <div className="hw-grid">
            <div className="hw-row">
              <Cpu size={15} />
              <span className="hw-label">{t("runtime.cpu")}</span>
              <span className="mono">
                {cpu?.name || String(sys.Processor ?? "—")}
                {cpu?.cores ? ` · ${cpu.cores}C/${cpu.threads}T` : ""}
              </span>
            </div>
            <div className="hw-row">
              <MemoryStick size={15} />
              <span className="hw-label">{t("runtime.memory")}</span>
              <span className="mono">{String(sys["Physical Memory"] || "—")}</span>
            </div>
            {gpus.map((g, i) => (
              <div className="hw-row" key={`gpu-${i}`}>
                <Cpu size={15} />
                <span className="hw-label">
                  {t("runtime.gpu")} {i + 1}
                  {g.integrated ? ` (${t("runtime.igpu")})` : ""}
                </span>
                <span className="mono">
                  {g.name || "—"}
                  {g.vram_gb ? ` · ${g.vram_gb} GB` : ""}
                  {g.virtual_mem_gb ? ` (+${g.virtual_mem_gb} GB GTT)` : ""}
                  {g.family ? ` · ${g.family}` : ""}
                </span>
              </div>
            ))}
            {npu?.available && (
              <div className="hw-row">
                <Cpu size={15} />
                <span className="hw-label">{t("runtime.npu")}</span>
                <span className="mono">
                  {npu.name || "—"}
                  {npu.tops_max_int ? ` · ${npu.tops_max_int} TOPS` : ""}
                  {npu.family ? ` · ${npu.family}` : ""}
                </span>
              </div>
            )}
            {storage && !storage.error && (
              <div className="hw-row">
                <HardDrive size={15} />
                <span className="hw-label">{t("runtime.storage")}</span>
                <span className="mono">
                  {t("runtime.used")} {fmtBytes(storage.used_bytes)} / {fmtBytes(storage.total_bytes)}
                  {typeof storage.free_bytes === "number" ? ` · ${t("runtime.free")} ${fmtBytes(storage.free_bytes)}` : ""}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

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
                  <td>
                    <div className="cell-truncate" title={m.model_name || ""}>
                      <strong>{m.model_name || "—"}</strong>
                    </div>
                  </td>
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
