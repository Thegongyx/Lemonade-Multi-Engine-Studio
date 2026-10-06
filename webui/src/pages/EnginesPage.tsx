import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  RefreshCw,
  ListTree,
  DownloadCloud,
  FolderPlus,
  Trash2,
  ChevronDown,
  ChevronRight,
  CirclePlus,
  EyeOff,
  PackageMinus,
  Wrench,
  Boxes,
  Undo2,
} from "lucide-react";
import { api, type BackendInfo, type EngineInfo } from "../api";
import ParamsModal from "../components/ParamsModal";
import EngineConfigModal from "../components/EngineConfigModal";
import DownloadProgress from "../components/DownloadProgress";
import { useToast, ToastHost } from "../components/Toast";
import { useConfirmDialog } from "../components/ConfirmDialog";

type BackendRow = {
  recipe: string;
  backend: string;
  state: string;
  version?: string;
  release_url?: string;
  message?: string;
  can_uninstall?: boolean;
};

const isUpdatable = (state: string) => state === "update_required" || state === "update_available";

export default function EnginesPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"list" | "download">("list");
  const [engines, setEngines] = useState<EngineInfo[]>([]);
  const [backends, setBackends] = useState<BackendRow[]>([]);
  const [path, setPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [paramsFor, setParamsFor] = useState<EngineInfo | null>(null);
  const [configFor, setConfigFor] = useState<EngineInfo | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  const { toasts, removeToast, showError, showSuccess } = useToast();
  const { confirm, ConfirmHost } = useConfirmDialog();

  const grouped = useMemo(() => {
    const m = new Map<string, BackendRow[]>();
    backends
      .filter((b) => b.state !== "unsupported")
      .forEach((b) => {
        if (!m.has(b.recipe)) m.set(b.recipe, []);
        m.get(b.recipe)!.push(b);
      });
    return Array.from(m.entries());
  }, [backends]);

  const toggleGroup = (r: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });

  const load = () => {
    setLoading(true);
    setError("");
    api
      .listEngines()
      .then((r) => setEngines(r.engines || []))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
    api
      .systemInfo()
      .then((r) => {
        const rows: BackendRow[] = [];
        const recs = r.recipes || {};
        Object.entries(recs).forEach(([recipe, v]) => {
          const backs = v.backends || {};
          Object.entries(backs).forEach(([backend, bv]) => {
            const info = bv as BackendInfo;
            rows.push({
              recipe,
              backend,
              state: info?.state || "",
              version: info?.version,
              release_url: info?.release_url,
              message: info?.message,
              can_uninstall: info?.can_uninstall,
            });
          });
        });
        rows.sort((a, b) => (a.recipe + a.backend).localeCompare(b.recipe + b.backend));
        setBackends(rows);
      })
      .catch(() => {});
  };
  useEffect(load, []);

  const addEngine = async () => {
    const p = path.trim();
    if (!p) return;
    setError("");
    try {
      const r = await api.addEngine(p);
      showSuccess(`${t("engines.added")}: ${r.id} (${r.backend})`);
      setPath("");
      load();
    } catch (e) {
      setError(String(e));
    }
  };

  const registerEngine = async (engine: EngineInfo) => {
    try {
      const r = await api.addEngine(engine.path);
      showSuccess(`${t("engines.added")}: ${r.id} (${r.backend})`);
      load();
    } catch (e) {
      showError(String(e));
    }
  };

  const hideEngine = async (engine: EngineInfo) => {
    const ok = await confirm({
      title: t("engines.hideTitle"),
      message: t("engines.confirmHide", { name: engine.name }),
      confirmText: t("engines.hide"),
      cancelText: t("common.cancel"),
    });
    if (!ok) return;
    try {
      await api.deleteEngine(engine.id, "unregister");
      showSuccess(`${t("engines.hidden")}: ${engine.id}`);
      load();
    } catch (e) {
      showError(String(e));
    }
  };

  const removeEngine = async (engine: EngineInfo) => {
    const ok = await confirm({
      title: t("engines.unregisterTitle"),
      message: t("engines.confirmUnregister", { name: engine.name }),
      confirmText: t("engines.unregister"),
      cancelText: t("common.cancel"),
    });
    if (!ok) return;
    try {
      await api.deleteEngine(engine.id, "unregister");
      showSuccess(`${t("engines.removed")}: ${engine.id}`);
      load();
    } catch (e) {
      showError(String(e));
    }
  };

  const deleteEngineFiles = async (engine: EngineInfo) => {
    const ok = await confirm({
      title: t("engines.deleteFilesTitle"),
      message: t("engines.confirmDeleteFiles", { name: engine.name, path: engine.path }),
      confirmText: t("engines.deleteFiles"),
      cancelText: t("common.cancel"),
      danger: true,
      requireText: engine.id,
    });
    if (!ok) return;
    try {
      await api.deleteEngine(engine.id, "delete");
      showSuccess(`${t("engines.deleted")}: ${engine.id}`);
      load();
    } catch (e) {
      showError(String(e));
    }
  };

  const uninstallEngine = async (engine: EngineInfo) => {
    const ok = await confirm({
      title: t("engines.uninstallTitle"),
      message: t("engines.confirmUninstall", { name: engine.name }),
      confirmText: t("common.delete"),
      cancelText: t("common.cancel"),
      danger: true,
    });
    if (!ok) return;
    const recipe = engine.recipe || "llamacpp";
    const backend = engine.backend_ref || engine.id;
    try {
      await api.uninstallBackend(recipe, backend);
      showSuccess(`${t("engines.removed")}: ${engine.id}`);
      load();
    } catch (e) {
      showError(String(e));
    }
  };

  const updateEngine = async (engine: EngineInfo) => {
    const recipe = engine.recipe || "llamacpp";
    const backend = engine.backend_ref || engine.id;
    const key = `update:${engine.id}`;
    setBusy(key);
    try {
      await api.installBackend(recipe, backend);
      showSuccess(`${t("engines.installing")}: ${recipe}:${backend}`);
      load();
    } catch (e) {
      showError(String(e));
    } finally {
      setBusy(null);
    }
  };

  const install = async (recipe: string, backend: string) => {
    const key = `${recipe}:${backend}`;
    setBusy(key);
    setError("");
    try {
      await api.installBackend(recipe, backend);
      showSuccess(`${t("engines.installing")}: ${key}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };

  const updateAll = async () => {
    const targets = grouped.flatMap(([, rows]) => rows.filter((r) => isUpdatable(r.state)));
    if (targets.length === 0) return;
    const ok = await confirm({
      title: t("engines.updateAllTitle"),
      message: t("engines.confirmUpdateAll", { count: targets.length }),
      confirmText: t("engines.updateAll"),
      cancelText: t("common.cancel"),
    });
    if (!ok) return;
    for (const row of targets) {
      setBusy(`${row.recipe}:${row.backend}`);
      try {
        await api.installBackend(row.recipe, row.backend);
      } catch (e) {
        showError(`${row.recipe}:${row.backend} — ${String(e)}`);
      }
    }
    setBusy(null);
    showSuccess(t("engines.updated"));
    load();
  };

  const updatableCount = grouped.reduce(
    (sum, [, rows]) => sum + rows.filter((r) => isUpdatable(r.state)).length,
    0,
  );

  return (
    <>
      <div className="page-head">
        <h2>{t("engines.title")}</h2>
        <p>{t("engines.desc")}</p>
      </div>

      <div className="tabs">
        <button className={`tab${tab === "list" ? " active" : ""}`} onClick={() => setTab("list")}>
          {t("engines.tabList")}
        </button>
        <button className={`tab${tab === "download" ? " active" : ""}`} onClick={() => setTab("download")}>
          {t("engines.tabDownload")}
        </button>
      </div>

      {tab === "list" && (
        <>
          <div className="stat-tiles">
            <div className="stat-tile">
              <span className="ico"><Boxes size={19} /></span>
              <div>
                <div className="v">{engines.length}</div>
                <div className="k">{t("engines.statTotal")}</div>
              </div>
            </div>
            <div className="stat-tile">
              <span className="ico"><CirclePlus size={19} /></span>
              <div>
                <div className="v">{engines.filter((e) => e.source === "registered").length}</div>
                <div className="k">{t("engines.statRegistered")}</div>
              </div>
            </div>
            <div className="stat-tile">
              <span className="ico"><DownloadCloud size={19} /></span>
              <div>
                <div className="v">{engines.filter((e) => e.update_available).length}</div>
                <div className="k">{t("engines.statUpdatable")}</div>
              </div>
            </div>
          </div>

          <div className="card">
            <h3>{t("engines.addCustom")}</h3>
            <div className="row">
              <input
                value={path}
                onChange={(e) => setPath(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addEngine()}
                placeholder="C:\\path\\to\\llama.cpp\\build\\bin\\Release"
                className="mono"
              />
              <button className="btn primary" onClick={addEngine} disabled={!path.trim()}>
                <FolderPlus size={15} /> {t("engines.addCustom")}
              </button>
            </div>
            <div className="hint">{t("engines.addCustomHint")}</div>
          </div>

          <div className="card">
            <div className="row between" style={{ marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>{t("engines.registered")}</h3>
              <button className="btn sm" onClick={load} disabled={loading}>
                <RefreshCw size={14} /> {t("common.refresh")}
              </button>
            </div>
            {loading && <div className="hint">{t("common.loading")}</div>}
            {error && <div className="tag err">{error}</div>}
            {!loading && engines.length === 0 && <div className="hint">{t("engines.noEngines")}</div>}
            {engines.length > 0 && (
              <table>
                <thead>
                  <tr>
                    <th>{t("common.name")}</th>
                    <th>{t("common.backend")}</th>
                    <th>{t("common.device")}</th>
                    <th>{t("common.path")}</th>
                    <th className="col-actions">{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {engines.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <div className="cell-truncate narrow" title={e.name}>
                          <strong>{e.name}</strong>
                        </div>
                        <div className="mono">
                          {e.source}
                          {e.update_available ? ` · ${t("engines.stateUpdate")}` : ""}
                          {e.exists === false ? ` · ${t("engines.missing")}` : ""}
                        </div>
                      </td>
                      <td>
                        <span className="tag">{e.backend || "—"}</span>
                      </td>
                      <td className="mono">{e.device || "—"}</td>
                      <td className="mono">
                        <span className="cell-truncate" title={e.path}>
                          {e.path}
                        </span>
                      </td>
                      <td className="col-actions">
                        <div className="row">
                          <button className="btn sm" onClick={() => setParamsFor(e)} title={t("engines.params")}>
                            <ListTree size={14} />
                          </button>
                          <button className="btn sm" onClick={() => setConfigFor(e)} title={t("engines.configTitle")}>
                            <Wrench size={14} />
                          </button>
                          {e.source === "discovered" && (
                            <button className="btn sm" onClick={() => registerEngine(e)} title={t("engines.register")}>
                              <CirclePlus size={14} />
                            </button>
                          )}
                          {e.can_hide && (
                            <button className="btn sm" onClick={() => hideEngine(e)} title={t("engines.hide")}>
                              <EyeOff size={14} />
                            </button>
                          )}
                          {e.can_uninstall && (
                            <button className="btn sm" onClick={() => uninstallEngine(e)} title={t("common.delete")}>
                              <PackageMinus size={14} />
                            </button>
                          )}
                          {e.update_available && (
                            <button
                              className="btn sm primary"
                              disabled={busy === `update:${e.id}`}
                              onClick={() => updateEngine(e)}
                              title={t("engines.update")}
                            >
                              <DownloadCloud size={14} />
                            </button>
                          )}
                          {e.can_delete_files && !e.can_uninstall && (
                            <button className="btn sm" onClick={() => deleteEngineFiles(e)} title={t("engines.deleteFiles")}>
                              <Trash2 size={14} />
                            </button>
                          )}
                          {e.source === "registered" && (
                            <button className="btn sm" onClick={() => removeEngine(e)} title={t("engines.unregister")}>
                              <Undo2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === "download" && <DownloadProgress type="backend" onFinished={load} />}

      {tab === "download" && (
        <div className="card">
          <div className="row between" style={{ marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>{t("engines.download")}</h3>
            <div className="row">
              {updatableCount > 0 && (
                <button className="btn sm primary" onClick={updateAll} disabled={busy !== null}>
                  <DownloadCloud size={14} /> {t("engines.updateAll")} ({updatableCount})
                </button>
              )}
              <button className="btn sm" onClick={load} disabled={loading}>
                <RefreshCw size={14} /> {t("common.refresh")}
              </button>
            </div>
          </div>
          <div className="hint" style={{ marginBottom: 8 }}>{t("engines.downloadHint")}</div>
          {grouped.map(([recipe, rows]) => {
            const open = openGroups.has(recipe);
            const installed = rows.filter((r) => r.state === "installed").length;
            const updatable = rows.filter((r) => isUpdatable(r.state)).length;
            return (
              <div className="group" key={recipe}>
                <div className="group-head" onClick={() => toggleGroup(recipe)}>
                  {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <strong>{recipe}</strong>
                  <span className="tag">
                    {installed}/{rows.length}
                  </span>
                  {updatable > 0 && (
                    <span className="tag warn">
                      {updatable} {t("engines.updatesAvailable")}
                    </span>
                  )}
                </div>
                {open && (
                  <table>
                    <thead>
                      <tr>
                        <th>{t("common.name")}</th>
                        <th>{t("common.status")}</th>
                        <th>{t("engines.version")}</th>
                        <th className="col-actions" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((b) => {
                        const key = `${b.recipe}:${b.backend}`;
                        const installedLike = b.state === "installed" || isUpdatable(b.state);
                        return (
                          <tr key={key}>
                            <td>
                              <strong>{b.backend}</strong>
                              {b.message && (
                                <div className="mono cell-truncate" title={b.message}>
                                  {b.message}
                                </div>
                              )}
                            </td>
                            <td>
                              {b.state === "installed" ? (
                                <span className="tag ok">{t("engines.stateInstalled")}</span>
                              ) : isUpdatable(b.state) ? (
                                <span className="tag warn">{t("engines.stateUpdate")}</span>
                              ) : b.state === "installable" ? (
                                <span className="tag">{t("engines.stateInstallable")}</span>
                              ) : (
                                <span className="tag">{b.state || t("engines.stateInstallable")}</span>
                              )}
                            </td>
                            <td className="mono">
                              {b.release_url ? (
                                <a href={b.release_url} target="_blank" rel="noreferrer">
                                  {b.version || "—"}
                                </a>
                              ) : (
                                b.version || "—"
                              )}
                            </td>
                            <td className="col-actions">
                              <div className="row">
                                <button
                                  className={`btn sm${isUpdatable(b.state) ? " primary" : ""}`}
                                  disabled={busy === key}
                                  onClick={() => install(b.recipe, b.backend)}
                                >
                                  <DownloadCloud size={14} />{" "}
                                  {isUpdatable(b.state)
                                    ? t("engines.update")
                                    : b.state === "installed"
                                      ? t("engines.reinstall")
                                      : t("engines.download")}
                                </button>
                                {installedLike && (
                                  <button
                                    className="btn sm"
                                    disabled={busy === key}
                                    onClick={() =>
                                      uninstallEngine({
                                        id: b.backend,
                                        name: b.backend,
                                        path: "",
                                        backend: b.backend,
                                        recipe: b.recipe,
                                        backend_ref: b.backend,
                                        source: "downloaded",
                                        exists: true,
                                      })
                                    }
                                    title={t("common.delete")}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      )}

      {paramsFor && (
        <ParamsModal
          engineId={paramsFor.id}
          engineLabel={`${paramsFor.name} — ${paramsFor.path}`}
          onClose={() => setParamsFor(null)}
          onAdd={(params) => showSuccess(`${params.length} ${t("params.selected")}`)}
        />
      )}
      {configFor && (
        <EngineConfigModal
          engine={configFor}
          onClose={() => setConfigFor(null)}
          onSaved={load}
        />
      )}
      <ToastHost toasts={toasts} onRemove={removeToast} />
      <ConfirmHost />
    </>
  );
}
