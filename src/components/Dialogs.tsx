import { useEffect, useRef, useState } from 'react';

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="sheet-backdrop" onClick={onCancel}>
      <div className="sheet" role="alertdialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-title">{title}</div>
        <p className="sheet-note">{message}</p>
        <div className="sheet-actions">
          <button type="button" className="text-btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className={`text-btn ${danger ? 'danger' : 'primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PromptDialog({
  title,
  initialValue,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  initialValue: string;
  confirmLabel: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  const submit = () => {
    if (value.trim()) onConfirm(value.trim());
  };
  return (
    <div className="sheet-backdrop" onClick={onCancel}>
      <form
        className="sheet"
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="sheet-title">{title}</div>
        <input ref={input} className="text-input" value={value} onChange={(e) => setValue(e.target.value)} maxLength={80} aria-label={title} />
        <div className="sheet-actions">
          <button type="button" className="text-btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="text-btn primary" disabled={!value.trim()}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

export type ToastMessage = { id: number; text: string; tone?: 'info' | 'error'; sticky?: boolean };

export function Toast({ toast, onDismiss }: { toast: ToastMessage | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!toast || toast.sticky) return;
    const t = setTimeout(onDismiss, toast.tone === 'error' ? 4000 : 2200);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);
  if (!toast) return null;
  return (
    <div className={`toast ${toast.tone ?? 'info'}`} role="status" onClick={onDismiss}>
      {toast.text}
    </div>
  );
}
