import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FolderPlus,
  Save,
  Trash2,
  Play,
  Square,
  ScrollText,
  SlidersHorizontal,
  RefreshCw,
} from "lucide-react";
import { api, type EngineInfo, type ModelInfo } from "../api";
import ModelConfigModal from "../components/ModelConfigModal";
import ModelDownload from "../components/ModelDownload";
import LogsModal from "../components/LogsModal";

export default function ModelsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"list" | "download">("list");
  const [paths, setPaths] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [engines, setEngines] = useState<EngineInfo[]>([]);
  const [loaded, setLoaded] = useState<Set<string>>(new Set());
  const [configFor, setConfigFor] = useState<string | null>(null);
  const [logsFor, setLogsFor] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const notify = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2500);
  };

  const loadedSet = (h: { all_models_loaded?: unknown }): Set<string> => {
    const v = h.all_models_loaded;
    const arr = Array.isArray(v) ? v : v ? [v] : [];
    const names = arr
      .map((x) => (x as { model_name?: string })?.model_name)
      .filter((n): n is string => Boolean(n));
    return new Set(names);
  };

  const loadModels = () => {
    api
      .listModels()
      .then((r) => setModels(r.data || []))
      .catch((e) => setError(String(e)));
    api
      .health()
      .then((r) => setLoaded(loadedSet(r)))
      .catch(() => {});
  };

  const loadAll = () => {
    api.modelPaths().then((r) => setPaths(r.paths || [])).catch(() => {});
    api.listEngines().then((r) => setEngines(r.engines || [])).catch(() => {});
    loadModels();
  };

  useEffect(loadAll, []);
  useEffect(() => {
    const id = setInterval(() => {
      api
        .health()
        .then((r) => setLoaded(loadedSet(r)))
        .catch(() => {});
    }, 4000);
    return () => clearInterval(id);
  }, []);

  const addPath = () => {
    const v = draft.trim();
    if (!v || paths.includes(v)) return;
    setPaths((p) => [...p, v]);
    setDraft("");
  };

  const savePaths = async () => {
    try {
      const r = await api.setModelPaths(paths);
      setPaths(r.paths || paths);
      notify(t("paths.saved"));
      loadModels();
    } catch (e) {
      setError(String(e));
    }
  };

  const start = async (id: string) => {
    setBusy(id);
    setError("");
    try {
      await api.loadModel(id);
      notify(t("runtime.starting"));
      loadModels();
    } catch (e) {
      setError(String(e));
      setLogsFor(id);
    } finally {
      setBusy(null);
    }
  };

  const stop = async (id: string) => {
    setBusy(id);
    setError("");
    try {
      await api.unloadModel(id);
      loadModels();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };

  const engineOf = (m: ModelInfo) => String((m.recipe_options?.llamacpp_engine as string) || "");

  return (
    <>
      <div className="page-head">
        <h2>{t("models.title")}</h2>
        <p>{t("models.desc")}</p>
      </div>

      <div className="tabs">
        <button className={`tab${tab === "list" ? " active" : ""}`} onClick={() => setTab("list")}>
          {t("models.tabList")}
        </button>
        <button className={`tab${tab === "download" ? " active" : ""}`} onClick={() => setTab("download")}>
          {t("models.tabDownload")}
        </button>
      </div>

      {tab === "list" && (
        <>
          <div className="card">
            <h3>{t("paths.title")}</h3>
            <div className="row">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addPath()}
                placeholder="D:\\models  或  C:\\Users\\me\\.cache\\huggingface\\hub"
                className="mono"
              />
              <button className="btn" onClick={addPath} disabled={!draft.trim()}>
                <FolderPlus size={15} /> {t("paths.add")}
              </button>
              <button className="btn primary" onClick={savePaths}>
                <Save size={15} /> {t("paths.saveScan")}
              </button>
            </div>
            <div className="hint">{t("paths.hint")}</div>
            {paths.length > 0 && (
              <div className="chip-list" style={{ marginTop: 10 }}>
                {paths.map((p, i) => (
                  <span className="chip" key={p}>
                    <span className="mono">{p}</span>
                    <button onClick={() => setPaths((prev) => prev.filter((_, j) => j !== i))}>
                      <Trash2 size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="row between" style={{ marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>{t("models.list")}</h3>
              <button className="btn sm" onClick={loadAll}>
                <RefreshCw size={14} /> {t("common.refresh")}
              </button>
            </div>
            {error && <div className="tag err">{error}</div>}
            {models.length === 0 && <div className="hint">{t("models.noModels")}</div>}
            {models.length > 0 && (
              <table>
                <thead>
                  <tr>
                    <th>{t("models.model")}</th>
                    <th>{t("models.engine")}</th>
                    <th>{t("common.status")}</th>
                    <th style={{ width: 260 }}>{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((m) => {
                    const running = loaded.has(m.id);
                    const eng = engineOf(m);
                    return (
                      <tr key={m.id}>
                        <td>
                          <strong>{m.id}</strong>
                          <div className="mono">{m.size ? `${m.size} GB` : ""}</div>
                        </td>
                        <td>{eng ? <span className="tag">{eng}</span> : <span className="tag">默认</span>}</td>
                        <td>
                          {running ? (
                            <span className="tag ok">{t("runtime.running")}</span>
                          ) : (
                            <span className="tag">{t("runtime.stopped")}</span>
                          )}
                        </td>
                        <td>
                          <div className="row">
                            <button className="btn sm" onClick={() => setConfigFor(m.id)}>
                              <SlidersHorizontal size={14} /> {t("models.params")}
                            </button>
                            {running ? (
                              <button className="btn sm" disabled={busy === m.id} onClick={() => stop(m.id)}>
                                <Square size={14} /> {t("runtime.stop")}
                              </button>
                            ) : (
                              <button className="btn sm primary" disabled={busy === m.id} onClick={() => start(m.id)}>
                                <Play size={14} /> {t("runtime.start")}
                              </button>
                            )}
                            <button className="btn sm" onClick={() => setLogsFor(m.id)}>
                              <ScrollText size={14} /> {t("runtime.logs")}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === "download" && (
        <div className="card">
          <ModelDownload onPulled={loadModels} />
        </div>
      )}

      {configFor && (
        <ModelConfigModal
          modelId={configFor}
          engines={engines}
          onClose={() => setConfigFor(null)}
          onSaved={loadModels}
        />
      )}
      {logsFor && <LogsModal title={logsFor} onClose={() => setLogsFor(null)} />}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
