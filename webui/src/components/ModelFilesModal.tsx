import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, RefreshCw, FileText } from "lucide-react";
import { api } from "../api";

type ModelFile = {
  name: string;
  role?: string;
  size_bytes?: number;
  exists?: boolean;
};

const fmtBytes = (n?: number) => {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${n} B`;
};

export default function ModelFilesModal({ modelId, onClose }: { modelId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<ModelFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    api
      .modelFiles(modelId)
      .then((r) => setFiles((r.files as ModelFile[]) || []))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  };
  useEffect(load, [modelId]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h3 style={{ margin: 0 }}>{t("models.filesTitle")}</h3>
            <div className="mono">{modelId}</div>
          </div>
          <button className="btn ghost sm" onClick={onClose}>
            <X size={15} />
          </button>
        </div>
        <div className="modal-body">
          {loading && <div className="hint">{t("common.loading")}</div>}
          {error && <div className="tag err">{error}</div>}
          {!loading && !error && files.length === 0 && <div className="hint">{t("common.empty")}</div>}
          {!loading && files.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>{t("models.fileName")}</th>
                  <th>{t("models.fileRole")}</th>
                  <th>{t("download.size")}</th>
                  <th>{t("common.status")}</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f, i) => (
                  <tr key={`${f.name}-${i}`}>
                    <td className="mono">
                      <span className="cell-truncate" title={f.name}>
                        <FileText size={13} /> {f.name}
                      </span>
                    </td>
                    <td>{f.role ? <span className="tag">{f.role}</span> : "—"}</td>
                    <td className="mono">{fmtBytes(f.size_bytes)}</td>
                    <td>
                      {f.exists === false ? (
                        <span className="tag err">{t("engines.missing")}</span>
                      ) : (
                        <span className="tag ok">ok</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="modal-foot">
          <span className="hint" />
          <button className="btn sm" onClick={load} disabled={loading}>
            <RefreshCw size={14} /> {t("common.refresh")}
          </button>
        </div>
      </div>
    </div>
  );
}
