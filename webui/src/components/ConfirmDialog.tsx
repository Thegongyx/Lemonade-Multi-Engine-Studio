import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  /** When set, the user must type this exact text to enable the confirm button. */
  requireText?: string;
}

function ConfirmDialog({
  isOpen,
  options,
  onConfirm,
  onCancel,
}: {
  isOpen: boolean;
  options: ConfirmOptions;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTyped("");
      setTimeout(() => confirmRef.current?.focus(), 0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter" && (!options.requireText || typed === options.requireText)) onConfirm();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onConfirm, onCancel, options.requireText, typed]);

  if (!isOpen) return null;

  const blocked = Boolean(options.requireText) && typed !== options.requireText;

  return createPortal(
    <div className="confirm-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="confirm-box">
        <h3 className="confirm-title">{options.title}</h3>
        <p className="confirm-message">{options.message}</p>
        {options.requireText && (
          <input
            className="mono"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={options.requireText}
            autoFocus
          />
        )}
        <div className="confirm-actions">
          <button className="btn ghost" onClick={onCancel}>
            {options.cancelText ?? "Cancel"}
          </button>
          <button
            ref={confirmRef}
            className={`btn ${options.danger ? "confirm-danger" : "primary"}`}
            disabled={blocked}
            onClick={onConfirm}
          >
            {options.confirmText ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function useConfirmDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({ title: "", message: "" });
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setOptions(opts);
      setIsOpen(true);
      resolveRef.current = resolve;
    });
  }, []);

  const finish = useCallback((value: boolean) => {
    setIsOpen(false);
    resolveRef.current?.(value);
    resolveRef.current = null;
  }, []);

  const ConfirmHost = useCallback(
    () => (
      <ConfirmDialog
        isOpen={isOpen}
        options={options}
        onConfirm={() => finish(true)}
        onCancel={() => finish(false)}
      />
    ),
    [isOpen, options, finish],
  );

  return { confirm, ConfirmHost };
}
