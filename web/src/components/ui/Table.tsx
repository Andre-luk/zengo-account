import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import type { Paginated } from '@/types/api';

export const TableWrap = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn('overflow-x-auto', className)}>
    <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">{children}</table>
  </div>
);

export const THead = ({ children }: { children: ReactNode }) => (
  <thead className="bg-slate-50 dark:bg-slate-900/60">
    <tr>{children}</tr>
  </thead>
);

export const TH = ({ children, className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) => (
  <th
    scope="col"
    className={cn(
      'px-4 py-2.5 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400',
      className,
    )}
    {...props}
  >
    {children}
  </th>
);

export const TBody = ({ children }: { children: ReactNode }) => (
  <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">{children}</tbody>
);

export const TR = ({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) => (
  <tr
    className={cn(
      'transition-colors',
      onClick && 'cursor-pointer hover:bg-brand-50/60 dark:hover:bg-brand-500/5',
      className,
    )}
    onClick={onClick}
  >
    {children}
  </tr>
);

export const TD = ({ children, className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn('px-4 py-2.5 align-middle text-slate-700 dark:text-slate-300', className)} {...props}>
    {children}
  </td>
);

interface PaginationProps<T> {
  page: Paginated<T>;
  onPageChange: (page: number) => void;
}

/** Pagination compacte, alignée sous un tableau. */
export const Pagination = <T,>({ page, onPageChange }: PaginationProps<T>) => {
  const from = page.total === 0 ? 0 : (page.page - 1) * page.limit + 1;
  const to = Math.min(page.page * page.limit, page.total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
      <span>
        {from}–{to} sur <strong className="font-semibold text-slate-700 dark:text-slate-200">{page.total}</strong>
      </span>
      <div className="flex items-center gap-1.5">
        <Button
          variant="secondary"
          size="sm"
          disabled={page.page <= 1}
          onClick={() => onPageChange(page.page - 1)}
          icon={<ChevronLeft className="h-3.5 w-3.5" />}
        >
          Précédent
        </Button>
        <span className="px-1 tabular-nums">
          {page.page} / {page.pageCount}
        </span>
        <Button
          variant="secondary"
          size="sm"
          disabled={page.page >= page.pageCount}
          onClick={() => onPageChange(page.page + 1)}
        >
          Suivant
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
};
