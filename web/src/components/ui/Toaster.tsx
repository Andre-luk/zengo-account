import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { Tone } from '@/lib/labels';
import { useUiStore } from '@/store/ui';

const TONE_STYLES: Record<Tone, string> = {
  neutral: 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900',
  info: 'border-sky-200 bg-sky-50 dark:border-sky-500/30 dark:bg-sky-500/10',
  brand: 'border-brand-200 bg-brand-50 dark:border-brand-500/30 dark:bg-brand-500/10',
  success: 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10',
  warning: 'border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10',
  danger: 'border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10',
  critical: 'border-red-300 bg-red-100 dark:border-red-500/40 dark:bg-red-500/15',
};

const TONE_ICON: Record<Tone, ReactNode> = {
  neutral: <Info className="h-4 w-4 text-slate-500" />,
  info: <Info className="h-4 w-4 text-sky-600 dark:text-sky-400" />,
  brand: <Info className="h-4 w-4 text-brand-600 dark:text-brand-400" />,
  success: <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />,
  warning: <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />,
  danger: <XCircle className="h-4 w-4 text-rose-600 dark:text-rose-400" />,
  critical: <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />,
};

/** Pile de notifications, en bas à droite. */
export const Toaster = () => {
  const toasts = useUiStore((state) => state.toasts);
  const dismissToast = useUiStore((state) => state.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'pointer-events-auto flex items-start gap-3 rounded-xl border p-3 shadow-raised animate-slide-up',
            TONE_STYLES[toast.tone],
          )}
          role="status"
        >
          <span className="mt-0.5 shrink-0">{TONE_ICON[toast.tone]}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{toast.title}</p>
            {toast.description ? (
              <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">{toast.description}</p>
            ) : null}
          </div>
          <button
            type="button"
            className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-black/5 hover:text-slate-600 dark:hover:bg-white/10"
            onClick={() => dismissToast(toast.id)}
            aria-label="Fermer la notification"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
