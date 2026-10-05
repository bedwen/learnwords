import type { ToastItem, ToastType } from '../../context/ToastContext';

const indicatorClass: Record<ToastType, string> = {
  success: 'bg-emerald-500',
  error: 'bg-rose-500',
  info: 'bg-blue-500',
};

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm pointer-events-none"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.type === 'error' ? 'alert' : 'status'}
          data-toast-type={toast.type}
          className="pointer-events-auto bg-card text-surface-900 border border-surface-200 dark:border-surface-800 shadow-md rounded-lg px-4 py-3 text-sm flex items-center justify-between gap-3 transition-colors duration-200"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className={`h-2 w-2 shrink-0 rounded-full ${indicatorClass[toast.type]}`} aria-hidden="true" />
            <span className="break-words">{toast.message}</span>
          </div>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            className="shrink-0 text-surface-400 hover:text-surface-900 transition-colors text-lg leading-none"
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
