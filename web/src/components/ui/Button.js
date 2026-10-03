import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
const VARIANTS = {
    primary: 'bg-brand-600 text-white shadow-sm hover:bg-brand-700 focus-visible:outline-brand-600 disabled:bg-brand-300 dark:disabled:bg-brand-900',
    secondary: 'bg-white text-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus-visible:outline-brand-600 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-600 dark:hover:bg-slate-700',
    outline: 'bg-transparent text-brand-700 ring-1 ring-inset ring-brand-300 hover:bg-brand-50 focus-visible:outline-brand-600 dark:text-brand-300 dark:ring-brand-500/40 dark:hover:bg-brand-500/10',
    ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-brand-600 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white',
    danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700 focus-visible:outline-red-600 disabled:bg-red-300 dark:disabled:bg-red-900',
    success: 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 focus-visible:outline-emerald-600 disabled:bg-emerald-300 dark:disabled:bg-emerald-900',
};
const SIZES = {
    sm: 'h-8 px-3 text-xs gap-1.5',
    md: 'h-9 px-3.5 text-sm gap-2',
    lg: 'h-11 px-5 text-sm gap-2',
    icon: 'h-9 w-9 justify-center',
};
export const Button = ({ variant = 'primary', size = 'md', loading = false, icon, fullWidth = false, className, children, disabled, type = 'button', ...props }) => (_jsxs("button", { type: type, disabled: disabled || loading, className: cn('inline-flex items-center rounded-lg font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-70', VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className), ...props, children: [loading ? _jsx(Loader2, { className: "h-4 w-4 animate-spin", "aria-hidden": true }) : icon, children] }));
/** Groupe de boutons alignes (barres d'actions de fiche). */
export const ButtonGroup = ({ children, className }) => (_jsx("div", { className: cn('flex flex-wrap items-center gap-2', className), children: children }));
