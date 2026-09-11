import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Send, ScrollText, X, RefreshCw } from "lucide-react";
import { api, type ModelInfo } from "../api";

type Msg = { role: "user" | "assistant"; content: string };
type LogLine = { timestamp: string; severity: string; tag: string; line: string };

const apiKey = () => localStorage.getItem("apiKey") || "lemonade";

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

  const logBox = useRef<HTMLDivElement>(null);
  const chatBox = useRef<HTMLDivElement>(null);

  const loadModels = () => {
    api
      .listModels()
      .then((r) => {
        const list = r.data || [];
        setModels(list);
        if (!model && list.length > 0) setModel(list[0].id);
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

  const send = async () => {
    if (!model || !input.trim() || streaming) return;
    const userMsg: Msg = { role: "user", content: input.trim() };
    const history = [...messages, userMsg];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);
    setError("");
    try {
      const res = await fetch("/api/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey()}` },
        body: JSON.stringify({ model, messages: history, stream: true }),
      });
      if (!res.ok || !res.body) {
        throw new Error(`${res.status} ${res.statusText}: ${await res.text().catch(() => "")}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistant = "";
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const j = JSON.parse(data);
            const delta = j.choices?.[0]?.delta?.content || "";
            if (delta) {
              assistant += delta;
              setMessages([...history, { role: "assistant", content: assistant }]);
            }
          } catch {
            /* ignore partial */
          }
        }
      }
      loadModels();
    } catch (e) {
      setError(String(e));
      setMessages(history);
    } finally {
      setStreaming(false);
    }
  };

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
              {models.map((m) => (
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
      </div>

      <div className={`chat-layout${logsOpen ? " with-logs" : ""}`}>
        <div className="card chat-main">
          <div className="chat-msgs" ref={chatBox}>
            {messages.length === 0 && <div className="hint">{t("chat.empty")}</div>}
            {messages.map((m, i) => (
              <div key={i} className={`chat-msg ${m.role}`}>
                <div className="chat-role">{m.role === "user" ? t("chat.you") : model}</div>
                <div className="chat-text">{m.content || (streaming ? "…" : "")}</div>
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
            <button className="btn primary" onClick={send} disabled={streaming || !model || !input.trim()}>
              <Send size={15} /> {streaming ? t("chat.sending") : t("chat.send")}
            </button>
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
