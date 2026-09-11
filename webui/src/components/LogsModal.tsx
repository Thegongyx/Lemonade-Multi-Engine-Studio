import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, RefreshCw } from "lucide-react";
import { api } from "../api";

type LogLine = { timestamp: string; severity: string; tag: string; line: string };

export default function LogsModal({
  title,
  filter,
  onClose,
}: {
  title: string;
  filter?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [lines, setLines] = useState<LogLine[]>([]);
  const [auto, setAuto] = useState(true);
  const [q, setQ] = useState(filter || "");
  const boxRef = useRef<HTMLDivElement>(null);

  const load = () => {
    api
      .logs(300, q)
      .then((r) => setLines(r.lines || []))
      .catch(() => {});
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(load, 2000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, q]);

  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [lines]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3 style={{ margin: 0 }}>
            {t("logs.title")} — {title}
          </h3>
          <button className="btn ghost sm" onClick={onClose}>
            <X size={15} />
          </button>
        </div>
        <div className="modal-body">
          <div className="row" style={{ marginBottom: 8 }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("logs.filter")} />
            <button className="btn sm" onClick={() => setAuto((a) => !a)}>
              {auto ? t("logs.pause") : t("logs.resume")}
            </button>
            <button className="btn sm" onClick={load}>
              <RefreshCw size={14} />
            </button>
          </div>
          <div ref={boxRef} className="logbox">
            {lines.length === 0 && <div className="hint">{t("common.empty")}</div>}
            {lines.map((l, i) => (
              <div key={i} className={`logline sev-${(l.severity || "").toLowerCase()}`}>
                <span className="mono">{l.timestamp}</span>{" "}
                <span className="mono">[{l.tag}]</span> {l.line}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
