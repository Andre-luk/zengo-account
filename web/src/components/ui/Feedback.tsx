import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';

export const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn('animate-pulse rounded-md bg-slate-200 dark:bg-slate-800', className)} />
);

/** Squelette de tableau : evite le saut de mise en page au chargement. */
export const TableSkeleton = ({ rows = 6, columns = 4 }: { rows?: number; columns?: number }) => (
  <div className="divide-y divide-slate-100 dark:divide-slate-800">
    {Array.from({ length: rows }).map((_, rowIndex) => (
      <div key={rowIndex} className="flex items-center gap-4 px-4 py-3">
        {Array.from({ length: columns }).map((__, columnIndex) => (
          <Skeleton
            key={columnIndex}
            className={cn('h-4', columnIndex === 0 ? 'w-1/4' : 'flex-1', columnIndex === columns - 1 && 'w-16 flex-none')}
          />
        ))}
      </div>
    ))}
  </div>
);

export const EmptyState = ({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) => (
  <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
      {icon ?? <Inbox className="h-5 w-5" />}
    </span>
    <div>
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</p>
      {description ? <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</p> : null}
    </div>
    {action}
  </div>
);

export const ErrorState = ({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) => (
  <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-50 text-rose-500 dark:bg-rose-500/10 dark:text-rose-400">
      <AlertTriangle className="h-5 w-5" />
    </span>
    <div>
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Chargement impossible</p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{message ?? 'Une erreur est survenue.'}</p>
    </div>
    {onRetry ? (
      <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={onRetry}>
        Réessayer
      </Button>
    ) : null}
  </div>
);

/** État vide compact pour les listes imbriquées. */
export const InlineEmpty = ({ children }: { children: ReactNode }) => (
  <p className="px-4 py-6 text-center text-xs text-slate-500 dark:text-slate-400">{children}</p>
);
