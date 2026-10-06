import { useEffect, useRef, useState } from "react";

export type LogLine = {
  seq?: number;
  timestamp: string;
  severity: string;
  tag: string;
  line: string;
};

function wsUrl(): string {
  const base = (localStorage.getItem("serverBaseUrl") || "").trim();
  if (base) {
    try {
      const u = new URL(base);
      const proto = u.protocol === "https:" ? "wss:" : "ws:";
      return `${proto}//${u.host}/logs/stream`;
    } catch {
      /* fall through to same-origin */
    }
  }
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/logs/stream`;
}

// Streams log lines over the server's `/logs/stream` WebSocket. Reconnects with
// backoff; `connected` lets callers fall back to polling while it is down.
export function useLogStream(enabled: boolean, cap = 1000) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const seqRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!enabled) return;
    let closed = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (closed) return;
      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl());
      } catch {
        schedule();
        return;
      }
      wsRef.current = ws;
      ws.onopen = () => {
        retry = 0;
        setConnected(true);
        ws.send(
          JSON.stringify({
            type: "logs.subscribe",
            ...(seqRef.current !== undefined ? { after_seq: seqRef.current } : {}),
          }),
        );
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "logs.snapshot" && Array.isArray(msg.entries)) {
            setLines(msg.entries.slice(-cap));
            const last = msg.entries[msg.entries.length - 1];
            if (last?.seq) seqRef.current = last.seq;
          } else if (msg.type === "logs.entry" && msg.entry) {
            seqRef.current = msg.entry.seq ?? seqRef.current;
            setLines((prev) => {
              const next = [...prev, msg.entry as LogLine];
              return next.length > cap ? next.slice(next.length - cap) : next;
            });
          }
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        setConnected(false);
        schedule();
      };
      ws.onerror = () => {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      };
    };

    const schedule = () => {
      if (closed) return;
      retry += 1;
      timer = setTimeout(connect, Math.min(5000, 500 * retry));
    };

    connect();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      try {
        wsRef.current?.close();
      } catch {
        /* ignore */
      }
      setConnected(false);
    };
  }, [enabled, cap]);

  const clear = () => setLines([]);
  return { lines, connected, clear };
}
