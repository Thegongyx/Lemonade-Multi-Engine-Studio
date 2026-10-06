import { useEffect, useState } from "react";

export type ToastType = "error" | "success" | "warning" | "info";

export type ToastItem = {
  id: number;
  message: string;
  type: ToastType;
  duration?: number;
};

function ToastIcon({ type }: { type: ToastType }) {
  switch (type) {
    case "error":
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      );
    case "success":
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <polyline points="9 12 12 15 16 10" />
        </svg>
      );
    case "warning":
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    default:
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      );
  }
}

function ToastCard({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const [exiting, setExiting] = useState(false);
  const dismiss = () => {
    setExiting(true);
    setTimeout(onClose, 180);
  };

  useEffect(() => {
    const timer = setTimeout(dismiss, item.duration ?? 4000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  return (
    <div className={`toast-item toast-item-${item.type}${exiting ? " toast-item-exit" : ""}`} onClick={dismiss}>
      <span className="toast-item-icon">
        <ToastIcon type={item.type} />
      </span>
      <span className="toast-item-msg">{item.message}</span>
      <button className="toast-item-close" onClick={dismiss} aria-label="close">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

export function ToastHost({
  toasts,
  onRemove,
}: {
  toasts: ToastItem[];
  onRemove: (id: number) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <ToastCard key={t.id} item={t} onClose={() => onRemove(t.id)} />
      ))}
    </div>
  );
}

let toastSeq = 0;

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = (message: string, type: ToastType = "info", duration?: number) => {
    const id = ++toastSeq;
    setToasts((prev) => [...prev, { id, message, type, duration }]);
  };
  const removeToast = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return {
    toasts,
    removeToast,
    showError: (m: string, d?: number) => addToast(m, "error", d),
    showSuccess: (m: string, d?: number) => addToast(m, "success", d),
    showWarning: (m: string, d?: number) => addToast(m, "warning", d),
    showInfo: (m: string, d?: number) => addToast(m, "info", d),
  };
}
