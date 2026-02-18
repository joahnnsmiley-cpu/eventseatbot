import React, { createContext, useCallback, useContext, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { glass, glassFallback, radius, shadow } from '../../design/theme';
import { duration, easing } from '../../design/motion';

const GLASS_FALLBACK_STYLE = `
@supports not (backdrop-filter: blur(20px)) {
  .toast-glass-fallback { background: ${glassFallback} !important; }
}
`;

export type ToastType = 'success' | 'error' | 'info' | 'update';

type Toast = {
  id: string;
  message: string;
  type: ToastType;
};

type ToastContextValue = {
  showToast: (message: string, type?: ToastType) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 3000;

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) return { showToast: () => {} };
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, AUTO_DISMISS_MS);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <style>{GLASS_FALLBACK_STYLE}</style>
      <div
        className="fixed bottom-0 left-0 right-0 z-[9999] flex flex-col items-center gap-2 p-4 pointer-events-none"
        style={{
          paddingBottom: `calc(1rem + env(safe-area-inset-bottom))`,
        }}
      >
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{
                duration: duration.normal / 1000,
                ease: easing.primaryArray,
              }}
              className="toast-glass-fallback pointer-events-auto max-w-[min(360px,calc(100vw-32px))] w-full"
              style={{
                background: glass.background,
                backdropFilter: glass.backdropFilter,
                WebkitBackdropFilter: glass.WebkitBackdropFilter,
                border: glass.border,
                boxShadow: shadow.medium,
                borderRadius: radius.lg,
                padding: '12px 16px',
                fontSize: 14,
                color: t.type === 'error' ? '#B85C5C' : t.type === 'success' ? '#6F7C6A' : '#1C1C1C',
              }}
            >
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
