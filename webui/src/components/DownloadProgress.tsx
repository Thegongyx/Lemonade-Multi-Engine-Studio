import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pause, X } from "lucide-react";
import { api, type DownloadJob } from "../api";

const fmt = (n?: number) => {
  if (!n || n <= 0) return "0 MB";
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
};

const TERMINAL = new Set(["completed", "cancelled", "error"]);

/**
 * Server-backed download list. Polls GET /downloads, so the same in-flight jobs
 * are shown again after a page reload instead of resetting to "not downloaded".
 */
export default function DownloadProgress({
  onFinished,
  type,
}: {
  onFinished?: () => void;
  type?: string;
}) {
  const { t } = useTranslation();
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [error, setError] = useState("");
  const finishedRef = useRef("");

  const poll = () => {
    api
      .downloads()
      .then((r) => setJobs(Array.isArray(r) ? r : []))
      .catch((e) => setError(String(e)));
  };

  useEffect(() => {
    poll();
    const id = setInterval(poll, 1000);
    return () => clearInterval(id);
  }, []);

  // Refresh the parent's list once each time a job reaches a terminal state.
  useEffect(() => {
    const done = jobs
      .filter((j) => TERMINAL.has(j.status))
      .map((j) => j.id)
      .sort()
      .join(",");
    if (done && done !== finishedRef.current) {
      finishedRef.current = done;
      onFinished?.();
    }
  }, [jobs, onFinished]);

  const rows = type ? jobs.filter((j) => j.type === type) : jobs;
  if (rows.length === 0 && !error) return null;

  const act = async (id: string, action: "pause" | "cancel" | "remove") => {
    try {
      await api.controlDownload(id, action);
      poll();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="card">
      <h3>{t("dl.title")}</h3>
      {error && <div className="tag err">{error}</div>}
      <div className="dl-list">
        {rows.map((j) => {
          const pct = Math.max(0, Math.min(100, Math.round(j.percent ?? 0)));
          const cls =
            j.status === "error"
              ? " err"
              : j.status === "paused"
                ? " paused"
                : j.status === "completed"
                  ? " ok"
                  : "";
          const bytes =
            j.overall_bytes_downloaded ?? j.cumulative_bytes_downloaded ?? j.bytes_downloaded;
          return (
            <div className="dl-item" key={j.id}>
              <div className="dl-head">
                <span className="dl-name">{j.model_name || j.id}</span>
                <span className="row">
                  <span
                    className={`tag${j.status === "completed" ? " ok" : j.status === "error" ? " err" : ""}`}
                  >
                    {t(`dl.status.${j.status}`, { defaultValue: j.status })}
                  </span>
                  {j.running ? (
                    <>
                      <button className="btn sm" title={t("dl.pause")} onClick={() => act(j.id, "pause")}>
                        <Pause size={13} />
                      </button>
                      <button className="btn sm" title={t("dl.cancel")} onClick={() => act(j.id, "cancel")}>
                        <X size={13} />
                      </button>
                    </>
                  ) : (
                    <button className="btn sm" title={t("dl.remove")} onClick={() => act(j.id, "remove")}>
                      <X size={13} />
                    </button>
                  )}
                </span>
              </div>
              <div className="progress">
                <div className={`progress-fill${cls}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="dl-meta">
                {pct}% · {fmt(bytes)}
                {j.total_download_size ? ` / ${fmt(j.total_download_size)}` : ""}
                {j.total_files && j.total_files > 1
                  ? ` · ${t("dl.files", { done: (j.file_index ?? 0) + 1, total: j.total_files })}`
                  : ""}
                {j.file ? ` · ${j.file}` : ""}
                {j.error ? ` · ${j.error}` : ""}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
