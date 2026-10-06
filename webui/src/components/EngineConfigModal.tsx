import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Save, Wrench } from "lucide-react";
import { api, type EngineInfo } from "../api";

function envToText(env?: Record<string, string>): string {
  if (!env) return "";
  return Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}

function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n|;/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

export default function EngineConfigModal({
  engine,
  onClose,
  onSaved,
}: {
  engine: EngineInfo;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const editable = engine.source === "registered";
  const [backend, setBackend] = useState(engine.backend || "cpu");
  const [device, setDevice] = useState(engine.device || "");
  const [envText, setEnvText] = useState(envToText(engine.env));
  const [version, setVersion] = useState("");
  const [probing, setProbing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const probe = async () => {
    setProbing(true);
    setError("");
    try {
      const r = await api.engineVersion(engine.id);
      setVersion(r.version || "—");
    } catch (e) {
      setError(String(e));
    } finally {
      setProbing(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await api.updateEngine(engine.id, {
        backend,
        device,
        env: parseEnv(envText),
      });
      setToast(t("engines.saved"));
      onSaved();
      setTimeout(() => setToast(""), 1500);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h3 style={{ margin: 0 }}>{t("engines.configTitle")}</h3>
            <div className="mono">{engine.id} — {engine.path}</div>
          </div>
          <button className="btn ghost sm" onClick={onClose}>
            <X size={15} />
          </button>
        </div>
        <div className="modal-body">
          {error && <div className="tag err">{error}</div>}
          {!editable && (
            <div className="hint" style={{ marginBottom: 10 }}>{t("engines.notEditable")}</div>
          )}

          <div className="row" style={{ marginBottom: 10, alignItems: "flex-end" }}>
            <label className="field" style={{ flex: 1, marginBottom: 0 }}>
              <span>{t("common.backend")}</span>
              <select value={backend} onChange={(e) => setBackend(e.target.value)} disabled={!editable}>
                {["cpu", "rocm", "vulkan", "cuda", "metal", "auto"].map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
            <label className="field" style={{ flex: 1, marginBottom: 0 }}>
              <span>{t("common.device")}</span>
              <input
                className="mono"
                value={device}
                onChange={(e) => setDevice(e.target.value)}
                placeholder="ROCm0 / Vulkan0 / 空"
                disabled={!editable}
              />
            </label>
          </div>

          <label className="field">
            <span>{t("engines.envText")}</span>
            <textarea
              className="mono"
              value={envText}
              onChange={(e) => setEnvText(e.target.value)}
              placeholder={"KEY=VALUE\nLLAMA_MMB=1"}
              disabled={!editable}
            />
            <div className="hint">{t("engines.envHint")}</div>
          </label>

          <div className="row between">
            <div className="row">
              <button className="btn sm" onClick={probe} disabled={probing}>
                <Wrench size={14} /> {t("engines.probeVersion")}
              </button>
              {version && <span className="mono">{t("engines.version")}: {version}</span>}
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <span className="hint" />
          <div className="row">
            <button className="btn ghost" onClick={onClose}>
              {t("common.cancel")}
            </button>
            <button className="btn primary" onClick={save} disabled={!editable || saving}>
              <Save size={15} /> {t("common.save")}
            </button>
          </div>
        </div>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
