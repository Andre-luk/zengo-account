import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { Tone } from '@/lib/labels';

const TONE_CLASSES: Record<Tone, string> = {
  neutral:
    'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
  info: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/30',
  brand:
    'bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-500/30',
  success:
    'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30',
  warning:
    'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30',
  danger: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30',
  critical:
    'bg-red-100 text-red-800 ring-red-300 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/40',
};

const DOT_CLASSES: Record<Tone, string> = {
  neutral: 'bg-slate-400',
  info: 'bg-sky-500',
  brand: 'bg-brand-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-rose-500',
  critical: 'bg-red-600',
};

interface BadgeProps {
  tone?: Tone;
  children?: ReactNode;
  className?: string;
  /** Affiché une pastille colorée (pulse pour les tons critiques). */
  dot?: boolean;
  icon?: ReactNode;
}

export const Badge = ({ tone = 'neutral', children, className, dot, icon }: BadgeProps) => (
  <span
    className={cn(
      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap',
      TONE_CLASSES[tone],
      className,
    )}
  >
    {dot ? (
      <span className="relative flex h-1.5 w-1.5">
        {tone === 'critical' && (
          <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-75', DOT_CLASSES[tone])} />
        )}
        <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', DOT_CLASSES[tone])} />
      </span>
    ) : null}
    {icon}
    {children}
  </span>
);

/** Pastille compacte à utiliser dans les tableaux (uniquement une couleur + libellé). */
export const Dot = ({ tone = 'neutral', className }: { tone?: Tone; className?: string }) => (
  <span className={cn('inline-block h-2 w-2 shrink-0 rounded-full', DOT_CLASSES[tone], className)} />
);
