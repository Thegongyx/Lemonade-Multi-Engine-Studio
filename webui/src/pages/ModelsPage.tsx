import { useEffect, useMemo, useState } from "react";
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
  Search,
  DownloadCloud,
  CloudDownload,
  FileText,
  Boxes,
} from "lucide-react";
import { api, type EngineInfo, type ModelInfo } from "../api";
import ModelConfigModal from "../components/ModelConfigModal";
import ModelDownload from "../components/ModelDownload";
import ModelFilesModal from "../components/ModelFilesModal";
import LogsModal from "../components/LogsModal";
import { useToast, ToastHost } from "../components/Toast";
import { useConfirmDialog } from "../components/ConfirmDialog";

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
  const [filesFor, setFilesFor] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "size" | "status">("name");
  const [filterMode, setFilterMode] = useState<"all" | "updatable" | "running">("all");
  const [checking, setChecking] = useState(false);

  const { toasts, removeToast, showError, showSuccess, showWarning } = useToast();
  const { confirm, ConfirmHost } = useConfirmDialog();

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
      showSuccess(t("paths.saved"));
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
      showSuccess(t("runtime.starting"));
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

  const removeModel = async (m: ModelInfo) => {
    const ok = await confirm({
      title: t("models.deleteTitle"),
      message: t("models.confirmDelete", { name: m.id }),
      confirmText: t("common.delete"),
      cancelText: t("common.cancel"),
      danger: true,
    });
    if (!ok) return;
    setBusy(m.id);
    try {
      await api.deleteModel(m.id);
      showSuccess(`${t("models.deleted")}: ${m.id}`);
      loadModels();
    } catch (e) {
      showError(String(e));
    } finally {
      setBusy(null);
    }
  };

  const updateModel = async (m: ModelInfo) => {
    const ok = await confirm({
      title: t("models.updateTitle"),
      message: t("models.confirmUpdate", { name: m.id }),
      confirmText: t("engines.update"),
      cancelText: t("common.cancel"),
    });
    if (!ok) return;
    setBusy(m.id);
    try {
      await api.pull({ model: m.id, do_not_upgrade: false });
      showSuccess(`${t("models.updating")}: ${m.id}`);
      loadModels();
    } catch (e) {
      showError(String(e));
    } finally {
      setBusy(null);
    }
  };

  const checkUpdates = async () => {
    setChecking(true);
    try {
      const r = await api.checkModelUpdates();
      if (r.updates_available > 0) {
        showWarning(t("models.updatesFound", { count: r.updates_available }));
      } else {
        showSuccess(t("models.upToDate"));
      }
      loadModels();
    } catch (e) {
      showError(String(e));
    } finally {
      setChecking(false);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = models;
    if (filterMode === "updatable") list = list.filter((m) => m.update_available);
    if (filterMode === "running") list = list.filter((m) => loaded.has(m.id));
    if (q) list = list.filter((m) => m.id.toLowerCase().includes(q));
    const sorted = [...list];
    if (sortBy === "name") {
      sorted.sort((a, b) => a.id.localeCompare(b.id));
    } else if (sortBy === "size") {
      sorted.sort((a, b) => (b.size || 0) - (a.size || 0) || a.id.localeCompare(b.id));
    } else {
      sorted.sort(
        (a, b) => Number(loaded.has(b.id)) - Number(loaded.has(a.id)) || a.id.localeCompare(b.id),
      );
    }
    return sorted;
  }, [models, query, filterMode, sortBy, loaded]);

  const updateCount = useMemo(
    () => models.filter((m) => m.update_available).length,
    [models],
  );

  const engineOf = (m: ModelInfo) => {
    if (m.recipe && m.recipe !== "llamacpp") return m.recipe;
    return String((m.recipe_options?.llamacpp_engine as string) || "");
  };

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
          <div className="stat-tiles">
            <div className="stat-tile">
              <span className="ico"><Boxes size={19} /></span>
              <div>
                <div className="v">{models.length}</div>
                <div className="k">{t("models.statTotal")}</div>
              </div>
            </div>
            <div className="stat-tile">
              <span className="ico"><DownloadCloud size={19} /></span>
              <div>
                <div className="v">{updateCount}</div>
                <div className="k">{t("models.statUpdatable")}</div>
              </div>
            </div>
            <div className="stat-tile">
              <span className="ico"><Play size={19} /></span>
              <div>
                <div className="v">{models.filter((m) => loaded.has(m.id)).length}</div>
                <div className="k">{t("models.statRunning")}</div>
              </div>
            </div>
          </div>

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
              <h3 style={{ margin: 0 }}>
                {t("models.list")}
                {models.length > 0 && (
                  <span className="tag" style={{ marginLeft: 8 }}>
                    {models.length}
                  </span>
                )}
                {updateCount > 0 && (
                  <span className="tag warn" style={{ marginLeft: 6 }}>
                    {updateCount} {t("engines.updatesAvailable")}
                  </span>
                )}
              </h3>
              <div className="row">
                <select
                  value={filterMode}
                  onChange={(e) => setFilterMode(e.target.value as typeof filterMode)}
                  style={{ width: 140 }}
                >
                  <option value="all">{t("models.filterAll")}</option>
                  <option value="updatable">{t("models.filterUpdatable")}</option>
                  <option value="running">{t("models.filterRunning")}</option>
                </select>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  style={{ width: 130 }}
                >
                  <option value="name">{t("models.sortName")}</option>
                  <option value="size">{t("models.sortSize")}</option>
                  <option value="status">{t("models.sortStatus")}</option>
                </select>
                <div className="search-box">
                  <Search size={14} />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("common.search")}
                  />
                </div>
                <button className="btn sm" onClick={checkUpdates} disabled={checking}>
                  <CloudDownload size={14} /> {t("models.checkUpdates")}
                </button>
                <button className="btn sm" onClick={loadAll}>
                  <RefreshCw size={14} /> {t("common.refresh")}
                </button>
              </div>
            </div>
            {error && <div className="tag err">{error}</div>}
            {models.length === 0 && <div className="hint">{t("models.noModels")}</div>}
            {models.length > 0 && filtered.length === 0 && (
              <div className="hint">{t("common.empty")}</div>
            )}
            {filtered.length > 0 && (
              <table>
                <thead>
                  <tr>
                    <th>{t("models.model")}</th>
                    <th>{t("models.engine")}</th>
                    <th>{t("common.status")}</th>
                    <th className="col-actions">{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m) => {
                    const running = loaded.has(m.id);
                    const eng = engineOf(m);
                    return (
                      <tr key={m.id}>
                        <td>
                          <div className="cell-truncate" title={m.id}>
                            <strong>{m.id}</strong>
                          </div>
                          <div className="mono">{m.size ? `${m.size} GB` : ""}</div>
                        </td>
                        <td>{eng ? <span className="tag">{eng}</span> : <span className="tag">{t("models.defaultEngine")}</span>}</td>
                        <td className="nowrap">
                          {running ? (
                            <span className="tag ok">{t("runtime.running")}</span>
                          ) : (
                            <span className="tag">{t("runtime.stopped")}</span>
                          )}
                          {m.update_available && (
                            <span className="tag warn" style={{ marginLeft: 6 }}>
                              {t("engines.stateUpdate")}
                            </span>
                          )}
                        </td>
                        <td className="col-actions">
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
                            {m.update_available && (
                              <button className="btn sm" disabled={busy === m.id} onClick={() => updateModel(m)}>
                                <DownloadCloud size={14} /> {t("engines.update")}
                              </button>
                            )}
                            <button className="btn sm" onClick={() => setLogsFor(m.id)}>
                              <ScrollText size={14} /> {t("runtime.logs")}
                            </button>
                            <button className="btn sm" onClick={() => setFilesFor(m.id)} title={t("models.filesTitle")}>
                              <FileText size={14} />
                            </button>
                            <button
                              className="btn sm"
                              disabled={busy === m.id}
                              onClick={() => removeModel(m)}
                              title={t("common.delete")}
                            >
                              <Trash2 size={14} />
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
          recipe={models.find((m) => m.id === configFor)?.recipe}
          onClose={() => setConfigFor(null)}
          onSaved={loadModels}
        />
      )}
      {logsFor && <LogsModal title={logsFor} onClose={() => setLogsFor(null)} />}
      {filesFor && <ModelFilesModal modelId={filesFor} onClose={() => setFilesFor(null)} />}
      <ToastHost toasts={toasts} onRemove={removeToast} />
      <ConfirmHost />
    </>
  );
}
