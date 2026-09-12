import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw, ListTree, DownloadCloud, FolderPlus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { api, type EngineInfo } from "../api";
import ParamsModal from "../components/ParamsModal";
import DownloadProgress from "../components/DownloadProgress";

type BackendRow = { recipe: string; backend: string; state: string };

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
  const [toast, setToast] = useState("");
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  // Group backends by recipe, hiding ones this machine cannot run.
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

  const notify = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2500);
  };

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
          const backs = (v as { backends?: Record<string, { state?: string }> }).backends || {};
          Object.entries(backs).forEach(([backend, bv]) => {
            rows.push({ recipe, backend, state: (bv as { state?: string })?.state || "" });
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
      notify(`${t("engines.added")}: ${r.id} (${r.backend})`);
      setPath("");
      load();
    } catch (e) {
      setError(String(e));
    }
  };

  const removeEngine = async (id: string) => {
    try {
      await api.removeEngine(id);
      load();
    } catch (e) {
      setError(String(e));
    }
  };

  // Downloaded engines are backends installed via POST /install, so they are
  // removed by uninstalling the backend rather than deleting a config entry.
  const uninstallEngine = async (id: string) => {
    try {
      await api.uninstallBackend("llamacpp", id);
      notify(`${t("engines.removed")}: ${id}`);
      load();
    } catch (e) {
      setError(String(e));
    }
  };

  const install = async (recipe: string, backend: string) => {
    const key = `${recipe}:${backend}`;
    setBusy(key);
    setError("");
    try {
      await api.installBackend(recipe, backend);
      notify(`${t("engines.installing")}: ${key}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };

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
                    <th style={{ width: 190 }}>{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {engines.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <strong>{e.name}</strong>
                        <div className="mono">{e.source}</div>
                      </td>
                      <td><span className="tag">{e.backend || "—"}</span></td>
                      <td className="mono">{e.device || "—"}</td>
                      <td className="mono">{e.path}</td>
                      <td>
                        <div className="row">
                          <button className="btn sm" onClick={() => setParamsFor(e)}>
                            <ListTree size={14} /> {t("engines.params")}
                          </button>
                          {e.source === "registered" && (
                            <button className="btn sm" onClick={() => removeEngine(e.id)}>
                              <Trash2 size={14} /> {t("common.delete")}
                            </button>
                          )}
                          {e.source === "downloaded" && (
                            <button className="btn sm" onClick={() => uninstallEngine(e.id)}>
                              <Trash2 size={14} /> {t("common.delete")}
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
            <button className="btn sm" onClick={load} disabled={loading}>
              <RefreshCw size={14} /> {t("common.refresh")}
            </button>
          </div>
          <div className="hint" style={{ marginBottom: 8 }}>{t("engines.downloadHint")}</div>
          {grouped.map(([recipe, rows]) => {
            const open = openGroups.has(recipe);
            const installed = rows.filter((r) => r.state === "installed").length;
            return (
              <div className="group" key={recipe}>
                <div className="group-head" onClick={() => toggleGroup(recipe)}>
                  {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <strong>{recipe}</strong>
                  <span className="tag">
                    {installed}/{rows.length}
                  </span>
                </div>
                {open && (
                  <table>
                    <thead>
                      <tr>
                        <th>{t("common.name")}</th>
                        <th>{t("common.status")}</th>
                        <th style={{ width: 130 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((b) => {
                        const key = `${b.recipe}:${b.backend}`;
                        return (
                          <tr key={key}>
                            <td><strong>{b.backend}</strong></td>
                            <td>
                              {b.state === "installed" ? (
                                <span className="tag ok">installed</span>
                              ) : (
                                <span className="tag">{b.state || "available"}</span>
                              )}
                            </td>
                            <td>
                              <button
                                className="btn sm"
                                disabled={busy === key}
                                onClick={() => install(b.recipe, b.backend)}
                              >
                                <DownloadCloud size={14} /> {t("engines.download")}
                              </button>
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
          onAdd={(params) => notify(`${params.length} ${t("params.selected")}`)}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
