import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Save, Wand2, FileText, Wrench, RotateCcw } from "lucide-react";
import { api, type EngineInfo, type EngineParam } from "../api";
import ParamsModal from "./ParamsModal";
import { defaultEnvFor } from "../engineDefaultEnv";
import { useConfirmDialog } from "./ConfirmDialog";

type BuilderParam = { flag: string; value: string; type: EngineParam["type"] };

export default function ModelConfigModal({
  modelId,
  engines,
  recipe,
  onClose,
  onSaved,
}: {
  modelId: string;
  engines: EngineInfo[];
  recipe?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const effectiveRecipe = recipe || "llamacpp";
  const isLlama = effectiveRecipe === "llamacpp";
  // A missing engine recipe means the default llama.cpp family; other backends
  // (e.g. halowin) tag their entries so the picker can tell them apart.
  const engineRecipe = (e: EngineInfo) => e.recipe || "llamacpp";
  const compatible = (e: EngineInfo) => engineRecipe(e) === effectiveRecipe;
  const [engine, setEngine] = useState("");
  // An engine can drive a different program through the same recipe (a "gufo"
  // driver runs gufo instead of llama-server); its arguments live in that
  // driver's namespace, not in llamacpp_args.
  const selectedDriver = engines.find((e) => e.id === engine)?.driver || "llamacpp";
  const argsKey = selectedDriver === "gufo" ? "gufo_args"
    : isLlama ? "llamacpp_args"
    : `${effectiveRecipe}_args`;
  const [mode, setMode] = useState<"text" | "builder">("text");
  const [argsText, setArgsText] = useState("");
  const [envText, setEnvText] = useState("");
  const [envDirty, setEnvDirty] = useState(false);
  const [builder, setBuilder] = useState<BuilderParam[]>([]);
  const [ctxSize, setCtxSize] = useState("");
  const [prefillChunk, setPrefillChunk] = useState("");
  const [mtpGamma, setMtpGamma] = useState("");
  const [parallel, setParallel] = useState("1");
  const [autoEvict, setAutoEvict] = useState<"" | "true" | "false">("");
  const [evictIdle, setEvictIdle] = useState("");
  const [downsizeIdle, setDownsizeIdle] = useState("");
  const [evictWeight, setEvictWeight] = useState("");
  const [lifecycleDefaults, setLifecycleDefaults] = useState({ evict: "300", downsize: "60", weight: "1.0" });
  const [showParams, setShowParams] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const { confirm, ConfirmHost } = useConfirmDialog();

  useEffect(() => {
    api
      .modelOptions(modelId)
      .then((res) => {
        // The options endpoint returns { defaults, effective, saved, ... };
        // the live values are under `effective`.
        const r = res as {
          effective?: Record<string, unknown>;
          saved?: Record<string, unknown>;
          defaults?: Record<string, unknown>;
        };
        const eff = r.effective ?? r.saved ?? {};
        const saved = r.saved ?? {};
        const dflt = r.defaults ?? {};
        let eng = String(eff.llamacpp_engine ?? "");
        // Non-llama.cpp models have no llamacpp_engine option; default the picker
        // to this recipe's engine so the installed backend is shown as selected.
        if (!eng && !isLlama) {
          const own = engines.find((e) => engineRecipe(e) === effectiveRecipe);
          if (own) eng = own.id;
        }
        const savedEnv = String(eff.llamacpp_env ?? "");
        setEngine(eng);
        setArgsText(String(eff[argsKey] ?? ""));
        // A saved env is the user's own value; otherwise prefill the engine's defaults.
        if (savedEnv.trim() !== "") {
          setEnvText(savedEnv);
          setEnvDirty(true);
        } else {
          setEnvText(defaultEnvFor(eng));
          setEnvDirty(false);
        }
        const cs = Number(eff.ctx_size);
        setCtxSize(Number.isFinite(cs) && cs > 0 ? String(cs) : "");
        setPrefillChunk(String(eff.halowin_prefill_chunk ?? ""));
        setMtpGamma(String(eff.halowin_mtp_gamma ?? ""));
        setParallel(String(eff.halowin_parallel || "1"));
        // Lifecycle options: show the user's saved override (empty = use default),
        // with the resolved defaults as placeholders.
        if (saved.auto_evict === true) setAutoEvict("true");
        else if (saved.auto_evict === false) setAutoEvict("false");
        else setAutoEvict("");
        setEvictIdle(saved.evict_idle_timeout != null ? String(saved.evict_idle_timeout) : "");
        setDownsizeIdle(saved.downsize_idle_timeout != null ? String(saved.downsize_idle_timeout) : "");
        setEvictWeight(saved.evict_weight_factor != null ? String(saved.evict_weight_factor) : "");
        setLifecycleDefaults({
          evict: dflt.evict_idle_timeout != null ? String(dflt.evict_idle_timeout) : "300",
          downsize: dflt.downsize_idle_timeout != null ? String(dflt.downsize_idle_timeout) : "60",
          weight: dflt.evict_weight_factor != null ? String(dflt.evict_weight_factor) : "1.0",
        });
      })
      .catch(() => {});
  }, [modelId, argsKey, effectiveRecipe, isLlama, engines]);

  const finalArgs = useMemo(() => {
    if (mode === "text") return argsText.trim();
    return builder.map((p) => (p.value.trim() ? `${p.flag} ${p.value.trim()}` : p.flag)).join(" ");
  }, [mode, argsText, builder]);

  const addParams = (params: EngineParam[]) => {
    setBuilder((prev) => {
      const seen = new Set(prev.map((p) => p.flag));
      const add = params
        .filter((p) => !seen.has(p.flag))
        .map((p) => ({ flag: p.flag, value: p.default ?? "", type: p.type }));
      return [...prev, ...add];
    });
    setMode("builder");
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const evictN = evictIdle.trim() === "" ? null : Number(evictIdle);
      const downN = downsizeIdle.trim() === "" ? null : Number(downsizeIdle);
      const weightN = evictWeight.trim() === "" ? null : Number(evictWeight);
      if (
        (evictN !== null && (!Number.isFinite(evictN) || evictN <= 0)) ||
        (downN !== null && (!Number.isFinite(downN) || downN <= 0)) ||
        (weightN !== null && (!Number.isFinite(weightN) || weightN <= 0))
      ) {
        setError(t("models.lifecycleInvalid"));
        return;
      }
      const payload: Record<string, unknown> = {
        [argsKey]: finalArgs,
      };
      // The engine picker is a llama.cpp concept; other recipes pick their engine
      // from the recipe itself, so don't persist a stray llamacpp_engine.
      if (isLlama) {
        payload.llamacpp_engine = engine;
        payload.llamacpp_env = envText;
      }
      // Only send ctx_size when set, so an empty field keeps the global default.
      if (ctxSize.trim() !== "") payload.ctx_size = Number(ctxSize);
      if (effectiveRecipe === "halowin") {
        // Blank means "no QWENOX_PREFILL_CHUNK" → engine default (Windows 8192).
        payload.halowin_prefill_chunk = prefillChunk.trim();
        // Blank gamma = upstream auto (greedy 4, sampling adaptive).
        payload.halowin_mtp_gamma = mtpGamma.trim();
        // Concurrent serve slots (1-8).
        payload.halowin_parallel = parallel;
      }
      // Lifecycle options: null clears the per-model override so it falls back
      // to the global auto_evict / recipe defaults.
      payload.auto_evict = autoEvict === "" ? null : autoEvict === "true";
      payload.evict_idle_timeout = evictN;
      payload.downsize_idle_timeout = downN;
      payload.evict_weight_factor = weightN;
      await api.saveModelOptions(modelId, payload);
      setToast(t("models.saved"));
      onSaved();
      setTimeout(() => setToast(""), 1500);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const selected = engines.find((e) => e.id === engine);

  const reset = async () => {
    const ok = await confirm({
      title: t("models.resetTitle"),
      message: t("models.confirmReset", { name: modelId }),
      confirmText: t("models.reset"),
      cancelText: t("common.cancel"),
      danger: true,
    });
    if (!ok) return;
    setSaving(true);
    setError("");
    try {
      await api.resetModelOptions(modelId);
      setEngine("");
      setArgsText("");
      setEnvText("");
      setEnvDirty(false);
      setBuilder([]);
      setCtxSize("");
      setPrefillChunk("");
      setAutoEvict("");
      setEvictIdle("");
      setDownsizeIdle("");
      setEvictWeight("");
      setToast(t("models.resetDone"));
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
            <h3 style={{ margin: 0 }}>{t("models.configTitle")}</h3>
            <div className="mono">{modelId}</div>
          </div>
          <button className="btn ghost sm" onClick={onClose}>
            <X size={15} />
          </button>
        </div>
        <div className="modal-body">
          {error && <div className="tag err">{error}</div>}

          <label className="field">
            <span>{t("models.engine")}</span>
            <select
              value={engine}
              onChange={(e) => {
                setEngine(e.target.value);
                if (!envDirty) setEnvText(defaultEnvFor(e.target.value));
              }}
            >
              <option value="">—</option>
              {engines.map((e) => {
                const ok = compatible(e);
                return (
                  <option key={e.id} value={e.id} disabled={!ok}>
                    {e.name} ({e.backend || "?"}{e.driver && e.driver !== "llamacpp" ? `, ${e.driver}` : ""}){ok ? "" : ` — ${t("models.engineWrongRecipe")}`}
                  </option>
                );
              })}
            </select>
            <div className="hint">{t("models.engineHint")}</div>
          </label>

          <label className="field">
            <span>{t("models.argMode")}</span>
            <div className="row">
              <button className={`btn sm${mode === "text" ? " primary" : ""}`} onClick={() => setMode("text")}>
                <FileText size={14} /> {t("models.modeText")}
              </button>
              <button className={`btn sm${mode === "builder" ? " primary" : ""}`} onClick={() => setMode("builder")}>
                <Wrench size={14} /> {t("models.modeBuilder")}
              </button>
            </div>
          </label>

          {mode === "text" && (
            <label className="field">
              <span>{t("models.argsText")}</span>
              <textarea
                value={argsText}
                onChange={(e) => setArgsText(e.target.value)}
                placeholder={t("models.argsPlaceholder")}
              />
            </label>
          )}

          {mode === "builder" && (
            <div className="field">
              <div className="row between" style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{t("models.modeBuilder")}</span>
                <button className="btn sm" onClick={() => setShowParams(true)} disabled={!engine || selectedDriver !== "llamacpp"}>
                  <Wand2 size={14} /> {t("models.openCatalog")}
                </button>
              </div>
              {builder.length === 0 && <div className="hint">{t("models.openCatalog")}</div>}
              <div className="chip-list">
                {builder.map((p, i) => (
                  <span className="chip" key={p.flag}>
                    <span className="mono">{p.flag}</span>
                    <input
                      style={{ width: 110, padding: "2px 6px", fontSize: 12 }}
                      value={p.value}
                      onChange={(e) =>
                        setBuilder((prev) => prev.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
                      }
                    />
                    <button onClick={() => setBuilder((prev) => prev.filter((_, j) => j !== i))}>
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {isLlama && (
            <label className="field">
              <span>{t("models.envText")}</span>
              <textarea
                value={envText}
                onChange={(e) => {
                  setEnvText(e.target.value);
                  setEnvDirty(true);
                }}
                placeholder={t("models.envPlaceholder")}
              />
              <div className="hint">{t("models.envHint")}</div>
            </label>
          )}

          <label className="field">
            <span>{t("models.ctxSize")}</span>
            <input
              className="mono"
              value={ctxSize}
              onChange={(e) => setCtxSize(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="262144"
            />
            <div className="hint">{t("models.ctxSizeHint")}</div>
          </label>

          {effectiveRecipe === "halowin" && (
            <label className="field">
              <span>{t("models.prefillChunk")}</span>
              <input
                className="mono"
                value={prefillChunk}
                onChange={(e) => setPrefillChunk(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="4096"
              />
              <div className="hint">{t("models.prefillChunkHint")}</div>
            </label>
          )}

          {effectiveRecipe === "halowin" && (
            <label className="field">
              <span>{t("models.mtpGamma")}</span>
              <select value={mtpGamma} onChange={(e) => setMtpGamma(e.target.value)}>
                <option value="">{t("models.mtpGammaAuto")}</option>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={String(n)}>
                    {n}
                  </option>
                ))}
              </select>
              <div className="hint">{t("models.mtpGammaHint")}</div>
            </label>
          )}

          {effectiveRecipe === "halowin" && (
            <label className="field">
              <span>{t("models.parallel")}</span>
              <select value={parallel} onChange={(e) => setParallel(e.target.value)}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={String(n)}>
                    {n}
                  </option>
                ))}
              </select>
              <div className="hint">{t("models.parallelHint")}</div>
            </label>
          )}

          <div className="cfg-group">
            <div className="cfg-group-title">{t("models.lifecycle")}</div>
            <label className="field">
              <span>{t("models.autoEvict")}</span>
              <select
                value={autoEvict}
                onChange={(e) => setAutoEvict(e.target.value as "" | "true" | "false")}
              >
                <option value="">{t("models.autoEvictGlobal")}</option>
                <option value="true">{t("models.autoEvictOn")}</option>
                <option value="false">{t("models.autoEvictOff")}</option>
              </select>
              <div className="hint">{t("models.autoEvictHint")}</div>
            </label>
            <div className="row" style={{ alignItems: "flex-start" }}>
              <label className="field" style={{ flex: 1 }}>
                <span>{t("models.evictIdle")}</span>
                <input
                  className="mono"
                  value={evictIdle}
                  onChange={(e) => setEvictIdle(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder={lifecycleDefaults.evict}
                />
              </label>
              <label className="field" style={{ flex: 1 }}>
                <span>{t("models.downsizeIdle")}</span>
                <input
                  className="mono"
                  value={downsizeIdle}
                  onChange={(e) => setDownsizeIdle(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder={lifecycleDefaults.downsize}
                />
              </label>
            </div>
            <label className="field">
              <span>{t("models.evictWeight")}</span>
              <input
                className="mono"
                value={evictWeight}
                onChange={(e) => setEvictWeight(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder={lifecycleDefaults.weight}
              />
              <div className="hint">{t("models.lifecycleHint")}</div>
            </label>
          </div>

          <label className="field">
            <span>{t("models.finalArgs")}</span>
            <textarea readOnly value={finalArgs} />
            <div className="hint">{t("models.portHint")}</div>
          </label>
        </div>
        <div className="modal-foot">
          <span className="hint">{selected ? `${selected.name} → ${selected.path}` : ""}</span>
          <div className="row">
            <button className="btn ghost" onClick={reset} disabled={saving} title={t("models.reset")}>
              <RotateCcw size={14} /> {t("models.reset")}
            </button>
            <button className="btn ghost" onClick={onClose}>
              {t("common.cancel")}
            </button>
            <button className="btn primary" onClick={save} disabled={saving}>
              <Save size={15} /> {t("models.saveOptions")}
            </button>
          </div>
        </div>
      </div>

      {showParams && engine && (
        <ParamsModal engineId={engine} engineLabel={engine} onClose={() => setShowParams(false)} onAdd={addParams} />
      )}
      {toast && <div className="toast">{toast}</div>}
      <ConfirmHost />
    </div>
  );
}
