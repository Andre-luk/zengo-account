import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const CONTROL_BASE =
  'block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-brand-600 disabled:bg-slate-50 disabled:text-slate-500 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-600 dark:placeholder:text-slate-500 dark:focus:ring-brand-500 dark:disabled:bg-slate-800/50';

interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export const Field = ({ label, hint, error, required, children, className }: FieldProps) => (
  <div className={cn('space-y-1.5', className)}>
    {label ? (
      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
        {label}
        {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
      </label>
    ) : null}
    {children}
    {error ? (
      <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{error}</p>
    ) : hint ? (
      <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>
    ) : null}
  </div>
);

export const Input = ({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) => (
  <input className={cn(CONTROL_BASE, className)} {...props} />
);

export const Textarea = ({ className, rows = 3, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea rows={rows} className={cn(CONTROL_BASE, 'resize-y', className)} {...props} />
);

export const Select = ({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select className={cn(CONTROL_BASE, 'pr-8', className)} {...props}>
    {children}
  </select>
);

/** Case à cocher avec libellé inline. */
export const Checkbox = ({
  label,
  hint,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) => (
  <label className={cn('flex items-start gap-2.5', className)}>
    <input
      type="checkbox"
      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600 dark:border-slate-600 dark:bg-slate-800"
      {...props}
    />
    <span className="text-sm text-slate-700 dark:text-slate-300">
      {label}
      {hint ? <span className="block text-xs text-slate-500 dark:text-slate-400">{hint}</span> : null}
    </span>
  </label>
);
