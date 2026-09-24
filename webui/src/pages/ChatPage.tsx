import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Send, ScrollText, X, RefreshCw, Square } from "lucide-react";
import { api, type ModelInfo, type ModelTelemetry, type Stats } from "../api";

type Msg = {
  role: "user" | "assistant";
  content: string;
  model?: string;
  stats?: ModelTelemetry;
};
type LogLine = { timestamp: string; severity: string; tag: string; line: string };

const apiKey = () => localStorage.getItem("apiKey") || "lemonade";

const fmt = (n: number | undefined, digits = 1) =>
  typeof n === "number" && Number.isFinite(n) ? n.toFixed(digits) : "—";

function StatLine({ s }: { s: ModelTelemetry }) {
  const { t } = useTranslation();
  const draftPct =
    s.draft_n > 0 ? `${((s.draft_n_accepted / s.draft_n) * 100).toFixed(0)}%` : null;
  const promptTok = s.prompt_tokens > 0 ? s.prompt_tokens : s.input_tokens;
  return (
    <div className="chat-stats mono">
      <span>{t("chat.thisRequest")}:</span>
      <span>
        {t("chat.prefill")} {fmt(s.prefill_tokens_per_second)} {t("chat.tps")}
      </span>
      <span>
        {t("chat.decode")} {fmt(s.tokens_per_second)} {t("chat.tps")}
      </span>
      <span>
        {t("chat.ttft")} {fmt(s.time_to_first_token, 2)} s
      </span>
      {draftPct && (
        <span>
          {t("chat.draft")} {draftPct} ({s.draft_n_accepted}/{s.draft_n})
        </span>
      )}
      <span>
        {t("chat.promptTok")} {promptTok}
        {typeof s.cache_tokens === "number" ? ` (${t("chat.cached")} ${s.cache_tokens})` : ""}
      </span>
      <span>
        {t("chat.genTok")} {s.output_tokens}
      </span>
    </div>
  );
}

export default function ChatPage() {
  const { t } = useTranslation();
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [running, setRunning] = useState<Set<string>>(new Set());
  const [model, setModel] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const [logsOpen, setLogsOpen] = useState(false);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [autoLog, setAutoLog] = useState(true);
  const [totals, setTotals] = useState<Stats | null>(null);

  const logBox = useRef<HTMLDivElement>(null);
  const chatBox = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Only models that are present locally make sense to send to; keep the whole
  // list when the server does not report the flag.
  const selectable = useMemo(() => {
    const local = models.filter((m) => m.downloaded !== false);
    return local.length > 0 ? local : models;
  }, [models]);

  const loadModels = () => {
    api
      .listModels()
      .then((r) => {
        const list = r.data || [];
        setModels(list);
        const local = list.filter((m) => m.downloaded !== false);
        const candidates = local.length > 0 ? local : list;
        setModel((cur) => cur || (candidates[0]?.id ?? ""));
      })
      .catch((e) => setError(String(e)));
    api
      .health()
      .then((r) => {
        const v = r.all_models_loaded;
        const arr = Array.isArray(v) ? v : v ? [v] : [];
        setRunning(new Set(arr.map((x) => (x as { model_name?: string })?.model_name || "").filter(Boolean)));
      })
      .catch(() => {});
    api.stats().then(setTotals).catch(() => {});
  };
  useEffect(loadModels, []);

  useEffect(() => {
    if (!logsOpen) return;
    const loadLogs = () => api.logs(300).then((r) => setLogs(r.lines || [])).catch(() => {});
    loadLogs();
    if (!autoLog) return;
    const id = setInterval(loadLogs, 2000);
    return () => clearInterval(id);
  }, [logsOpen, autoLog]);

  useEffect(() => {
    if (logBox.current) logBox.current.scrollTop = logBox.current.scrollHeight;
  }, [logs]);
  useEffect(() => {
    if (chatBox.current) chatBox.current.scrollTop = chatBox.current.scrollHeight;
  }, [messages]);

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
  };

  const send = async () => {
    if (!model || !input.trim() || streaming) return;
    const userMsg: Msg = { role: "user", content: input.trim() };
    const history = [...messages, userMsg];
    const sentModel = model;
    setMessages([...history, { role: "assistant", content: "", model: sentModel }]);
    setInput("");
    setStreaming(true);
    setError("");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey()}` },
        body: JSON.stringify({ model: sentModel, messages: history, stream: true }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error(`${res.status} ${res.statusText}: ${await res.text().catch(() => "")}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistant = "";
      let buf = "";
      const handleLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) return;
        const data = trimmed.slice(5).trim();
        if (!data || data === "[DONE]") return;
        try {
          const j = JSON.parse(data);
          const delta = j.choices?.[0]?.delta?.content || "";
          if (delta) {
            assistant += delta;
            setMessages([...history, { role: "assistant", content: assistant, model: sentModel }]);
          }
        } catch {
          /* ignore partial */
        }
      };
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) handleLine(line);
      }
      if (buf) handleLine(buf); // stream ended without a trailing newline

      // Attach the rates of this request to the message that was just produced.
      try {
        const stats = await api.stats();
        setTotals(stats);
        const perModel = stats.models?.[sentModel] ?? stats;
        setMessages((cur) => {
          const next = [...cur];
          for (let i = next.length - 1; i >= 0; i--) {
            if (next[i].role === "assistant") {
              next[i] = { ...next[i], stats: perModel };
              break;
            }
          }
          return next;
        });
      } catch {
        /* stats are optional */
      }
    } catch (e) {
      if ((e as Error)?.name === "AbortError") {
        // Keep whatever was produced before the user stopped it.
      } else {
        setError(String(e));
        setMessages(history);
      }
    } finally {
      abortRef.current = null;
      setStreaming(false);
      loadModels();
    }
  };

  const totalDraftPct =
    totals && totals.draft_n_total > 0
      ? `${((totals.draft_n_accepted_total / totals.draft_n_total) * 100).toFixed(0)}%`
      : null;
  // Time-weighted over the requests this client sent: processed tokens / summed
  // backend seconds (input_tokens_total counts processed tokens, not the cached
  // prefix, so a cache hit does not dilute the rate).
  const sessionPrefill =
    totals && totals.prompt_seconds_total > 0
      ? totals.input_tokens_total / totals.prompt_seconds_total
      : undefined;
  const sessionDecode =
    totals && totals.predicted_seconds_total > 0
      ? totals.output_tokens_total / totals.predicted_seconds_total
      : undefined;
  const engine = totals?.engine?.[model];

  return (
    <>
      <div className="page-head">
        <h2>{t("chat.title")}</h2>
        <p>{t("chat.desc")}</p>
      </div>

      <div className="card" style={{ padding: 12 }}>
        <div className="row" style={{ alignItems: "flex-end" }}>
          <label className="field" style={{ marginBottom: 0, flex: 1 }}>
            <span>{t("chat.model")}</span>
            <select value={model} onChange={(e) => setModel(e.target.value)} style={{ height: 38 }}>
              {selectable.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id}
                  {running.has(m.id) ? `  (${t("runtime.running")})` : ""}
                </option>
              ))}
            </select>
          </label>
          <button className="btn" style={{ height: 38 }} onClick={loadModels}>
            <RefreshCw size={15} /> {t("common.refresh")}
          </button>
          <button className="btn" style={{ height: 38 }} onClick={() => setLogsOpen((v) => !v)}>
            <ScrollText size={15} /> {logsOpen ? t("chat.hideLogs") : t("chat.showLogs")}
          </button>
        </div>
        {totals && totals.request_count_total > 0 && (
          <div className="chat-stats mono" style={{ marginTop: 8 }}>
            <span>
              {t("chat.session")}: {t("chat.requests")} {totals.request_count_total}
            </span>
            <span>
              {t("chat.promptTok")} {totals.prompt_tokens_total}
            </span>
            <span>
              {t("chat.genTok")} {totals.output_tokens_total}
            </span>
            {totalDraftPct && (
              <span>
                {t("chat.draft")} {totalDraftPct}
              </span>
            )}
          </div>
        )}
        {(sessionPrefill !== undefined || sessionDecode !== undefined) && (
          <div className="chat-stats mono" style={{ marginTop: 4 }}>
            <span>{t("chat.avgSession")}:</span>
            <span>
              {t("chat.prefill")} {fmt(sessionPrefill)} {t("chat.tps")}
            </span>
            <span>
              {t("chat.decode")} {fmt(sessionDecode)} {t("chat.tps")}
            </span>
          </div>
        )}
        {engine && (
          <div className="chat-stats mono" style={{ marginTop: 4 }}>
            <span>
              {t("chat.avgEngine")} ({t("chat.sinceLoad")}):
            </span>
            <span>
              {t("chat.prefill")} {fmt(engine.prefill_tokens_per_second)} {t("chat.tps")}
            </span>
            <span>
              {t("chat.decode")} {fmt(engine.tokens_per_second)} {t("chat.tps")}
            </span>
          </div>
        )}
      </div>

      <div className={`chat-layout${logsOpen ? " with-logs" : ""}`}>
        <div className="card chat-main">
          <div className="chat-msgs" ref={chatBox}>
            {messages.length === 0 && <div className="hint">{t("chat.empty")}</div>}
            {messages.map((m, i) => (
              <div key={i} className={`chat-msg ${m.role}`}>
                <div className="chat-role">{m.role === "user" ? t("chat.you") : m.model || model}</div>
                <div className="chat-text">{m.content || (streaming ? "…" : "")}</div>
                {m.stats && <StatLine s={m.stats} />}
              </div>
            ))}
          </div>
          {error && <div className="tag err">{error}</div>}
          <div className="row chat-input">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={t("chat.placeholder")}
              rows={2}
            />
            {streaming ? (
              <button className="btn" onClick={stop}>
                <Square size={15} /> {t("chat.stop")}
              </button>
            ) : (
              <button className="btn primary" onClick={send} disabled={!model || !input.trim()}>
                <Send size={15} /> {t("chat.send")}
              </button>
            )}
          </div>
        </div>

        {logsOpen && (
          <div className="card chat-logs">
            <div className="row between" style={{ marginBottom: 8 }}>
              <strong>{t("logs.title")}</strong>
              <div className="row">
                <button className="btn sm" onClick={() => setAutoLog((a) => !a)}>
                  {autoLog ? t("logs.pause") : t("logs.resume")}
                </button>
                <button className="btn ghost sm" onClick={() => setLogsOpen(false)}>
                  <X size={14} />
                </button>
              </div>
            </div>
            <div className="logbox" ref={logBox}>
              {logs.length === 0 && <div className="hint">{t("common.empty")}</div>}
              {logs.map((l, i) => (
                <div key={i} className={`logline sev-${(l.severity || "").toLowerCase()}`}>
                  <span className="mono">{l.timestamp}</span> <span className="mono">[{l.tag}]</span> {l.line}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
