import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from '@/lib/cn';
/** Onglets controles, style « souligne » sobre. */
export const Tabs = ({ items, value, onChange, className }) => (_jsx("div", { className: cn('flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800', className), children: items.map((item) => {
        const active = item.id === value;
        return (_jsxs("button", { type: "button", onClick: () => onChange(item.id), className: cn('-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors', active
                ? 'border-brand-600 text-brand-700 dark:border-brand-400 dark:text-brand-300'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'), children: [item.icon, item.label, item.count !== undefined && item.count > 0 ? (_jsx("span", { className: cn('rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums', active
                        ? 'bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300'
                        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'), children: item.count })) : null] }, item.id));
    }) }));
