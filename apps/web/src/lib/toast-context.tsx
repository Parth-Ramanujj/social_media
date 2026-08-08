'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type ToastKind = 'ok' | 'fail' | 'info';

interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

const ToastCtx = createContext<{ toast: (text: string, kind?: ToastKind) => void } | null>(null);

export function useToast() {
  const v = useContext(ToastCtx);
  if (!v) throw new Error('useToast outside provider');
  return v;
}

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((text: string, kind: ToastKind = 'info') => {
    const id = nextId++;
    setToasts((t) => [...t, { id, kind, text }]);
    window.setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 4200);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
