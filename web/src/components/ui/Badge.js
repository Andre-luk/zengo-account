import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from '@/lib/cn';
const TONE_CLASSES = {
    neutral: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
    info: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/30',
    brand: 'bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-500/30',
    success: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30',
    warning: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30',
    danger: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30',
    critical: 'bg-red-100 text-red-800 ring-red-300 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/40',
};
const DOT_CLASSES = {
    neutral: 'bg-slate-400',
    info: 'bg-sky-500',
    brand: 'bg-brand-500',
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    danger: 'bg-rose-500',
    critical: 'bg-red-600',
};
export const Badge = ({ tone = 'neutral', children, className, dot, icon }) => (_jsxs("span", { className: cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap', TONE_CLASSES[tone], className), children: [dot ? (_jsxs("span", { className: "relative flex h-1.5 w-1.5", children: [tone === 'critical' && (_jsx("span", { className: cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-75', DOT_CLASSES[tone]) })), _jsx("span", { className: cn('relative inline-flex h-1.5 w-1.5 rounded-full', DOT_CLASSES[tone]) })] })) : null, icon, children] }));
/** Pastille compacte a utiliser dans les tableaux (uniquement une couleur + libelle). */
export const Dot = ({ tone = 'neutral', className }) => (_jsx("span", { className: cn('inline-block h-2 w-2 shrink-0 rounded-full', DOT_CLASSES[tone], className) }));
