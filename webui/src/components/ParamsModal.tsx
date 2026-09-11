import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { api, type EngineParam } from "../api";

type Props = {
  engineId: string;
  engineLabel: string;
  onClose: () => void;
  onAdd: (params: EngineParam[]) => void;
};

export default function ParamsModal({ engineId, engineLabel, onClose, onAdd }: Props) {
  const { t } = useTranslation();
  const [params, setParams] = useState<EngineParam[]>([]);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    api
      .engineParams(engineId)
      .then((r) => setParams(r.params || []))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [engineId]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return params;
    return params.filter(
      (p) =>
        p.flag.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        (p.help || "").toLowerCase().includes(q),
    );
  }, [params, filter]);

  const toggle = (flag: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(flag) ? next.delete(flag) : next.add(flag);
      return next;
    });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h3 style={{ margin: 0 }}>{t("params.title")}</h3>
            <div className="mono">{engineLabel}</div>
          </div>
          <button className="btn ghost sm" onClick={onClose}>
            <X size={15} />
          </button>
        </div>
        <div className="modal-body">
          <p className="hint" style={{ marginTop: 0 }}>{t("params.desc")}</p>
          <input
            placeholder={t("params.filter")}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ marginBottom: 10 }}
          />
          {loading && <div className="hint">{t("common.loading")}</div>}
          {error && <div className="tag err">{error}</div>}
          {!loading && !error && (
            <table>
              <thead>
                <tr>
                  <th style={{ width: 34 }} />
                  <th>{t("params.flag")}</th>
                  <th>{t("params.type")}</th>
                  <th>{t("params.default")}</th>
                  <th>{t("params.help")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.flag} className={`param-row${selected.has(p.flag) ? " selected" : ""}`} onClick={() => toggle(p.flag)}>
                    <td>
                      <input className="check" type="checkbox" checked={selected.has(p.flag)} readOnly />
                    </td>
                    <td className="mono">{p.flag}</td>
                    <td>{p.type}</td>
                    <td className="mono">{p.default ?? "—"}</td>
                    <td>{p.help || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="modal-foot">
          <span className="hint">
            {selected.size} {t("params.selected")}
          </span>
          <div className="row">
            <button className="btn ghost" onClick={onClose}>
              {t("common.cancel")}
            </button>
            <button
              className="btn primary"
              disabled={selected.size === 0}
              onClick={() => {
                onAdd(params.filter((p) => selected.has(p.flag)));
                onClose();
              }}
            >
              {t("params.addSelected")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
