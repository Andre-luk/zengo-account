import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { Tone } from '@/lib/labels';

export const Card = ({ children, className }: { children: ReactNode; className?: string }) => (
  <section
    className={cn(
      'rounded-xl border border-slate-200 bg-white shadow-card dark:border-slate-800 dark:bg-slate-900',
      className,
    )}
  >
    {children}
  </section>
);

interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export const CardHeader = ({ title, description, actions, icon, className }: CardHeaderProps) => (
  <header
    className={cn(
      'flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800',
      className,
    )}
  >
    <div className="flex min-w-0 items-start gap-3">
      {icon ? (
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
          {icon}
        </span>
      ) : null}
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>
        ) : null}
      </div>
    </div>
    {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
  </header>
);

export const CardBody = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn('px-5 py-4', className)}>{children}</div>
);

export const CardFooter = ({ children, className }: { children: ReactNode; className?: string }) => (
  <footer
    className={cn(
      'flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-3 dark:border-slate-800',
      className,
    )}
  >
    {children}
  </footer>
);

interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  onClick?: () => void;
}

const STAT_TONES: Record<Tone, string> = {
  brand: 'bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300',
  success: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300',
  warning: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300',
  danger: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300',
  critical: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  info: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300',
  neutral: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

export const StatCard = ({ label, value, hint, icon, tone = 'brand', onClick }: StatCardProps) => (
  <Card
    className={cn(
      'p-4 transition-shadow',
      onClick && 'cursor-pointer hover:shadow-raised focus-visible:outline-brand-600',
    )}
  >
    <div
      className="flex items-start justify-between gap-3"
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(event) => {
        if (onClick && (event.key === 'Enter' || event.key === ' ')) onClick();
      }}
    >
      <div className="min-w-0">
        <p className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">{label}</p>
        <p className="mt-1.5 text-2xl font-semibold text-slate-900 tabular-nums dark:text-white">{value}</p>
        {hint ? <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p> : null}
      </div>
      {icon ? (
        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', STAT_TONES[tone])}>
          {icon}
        </span>
      ) : null}
    </div>
  </Card>
);

/** Ligne « libellé / valeur » utilisée dans les fiches detaillees. */
export const DataRow = ({
  label,
  value,
  className,
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) => (
  <div className={cn('flex items-start justify-between gap-4 py-1.5', className)}>
    <dt className="shrink-0 text-xs text-slate-500 dark:text-slate-400">{label}</dt>
    <dd className="min-w-0 text-right text-sm font-medium text-slate-800 dark:text-slate-200">{value}</dd>
  </div>
);

export const DescriptionList = ({ children, className }: { children: ReactNode; className?: string }) => (
  <dl className={cn('divide-y divide-slate-100 dark:divide-slate-800', className)}>{children}</dl>
);
