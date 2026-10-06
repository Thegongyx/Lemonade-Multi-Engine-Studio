import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, RefreshCw } from "lucide-react";
import { api } from "../api";
import { useLogStream, type LogLine } from "../utils/logStream";

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
  const [auto, setAuto] = useState(true);
  const [q, setQ] = useState(filter || "");
  const boxRef = useRef<HTMLDivElement>(null);
  const [polled, setPolled] = useState<LogLine[]>([]);

  const stream = useLogStream(auto);

  // Polling fallback while the WebSocket is down (or unavailable).
  useEffect(() => {
    if (stream.connected || !auto) return;
    const load = () =>
      api
        .logs(300)
        .then((r) => setPolled((r.lines as LogLine[]) || []))
        .catch(() => {});
    load();
    const id = setInterval(load, 2000);
    return () => clearInterval(id);
  }, [stream.connected, auto]);

  const raw = stream.lines.length > 0 || stream.connected ? stream.lines : polled;
  const needle = q.trim().toLowerCase();
  const lines = needle
    ? raw.filter((l) => `${l.timestamp} ${l.tag} ${l.line}`.toLowerCase().includes(needle))
    : raw;

  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [lines]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3 style={{ margin: 0 }}>
            {t("logs.title")} — {title}
            <span className={`tag ${stream.connected ? "ok" : ""}`} style={{ marginLeft: 8 }}>
              {stream.connected ? t("logs.live") : t("logs.polling")}
            </span>
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
            <button className="btn sm" onClick={stream.clear}>
              <RefreshCw size={14} />
            </button>
          </div>
          <div ref={boxRef} className="logbox">
            {lines.length === 0 && <div className="hint">{t("common.empty")}</div>}
            {lines.map((l, i) => (
              <div key={l.seq ?? i} className={`logline sev-${(l.severity || "").toLowerCase()}`}>
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
