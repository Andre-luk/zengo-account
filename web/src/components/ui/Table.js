import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
export const TableWrap = ({ children, className }) => (_jsx("div", { className: cn('overflow-x-auto', className), children: _jsx("table", { className: "min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800", children: children }) }));
export const THead = ({ children }) => (_jsx("thead", { className: "bg-slate-50 dark:bg-slate-900/60", children: _jsx("tr", { children: children }) }));
export const TH = ({ children, className, ...props }) => (_jsx("th", { scope: "col", className: cn('px-4 py-2.5 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400', className), ...props, children: children }));
export const TBody = ({ children }) => (_jsx("tbody", { className: "divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900", children: children }));
export const TR = ({ children, className, onClick, }) => (_jsx("tr", { className: cn('transition-colors', onClick && 'cursor-pointer hover:bg-brand-50/60 dark:hover:bg-brand-500/5', className), onClick: onClick, children: children }));
export const TD = ({ children, className, ...props }) => (_jsx("td", { className: cn('px-4 py-2.5 align-middle text-slate-700 dark:text-slate-300', className), ...props, children: children }));
/** Pagination compacte, alignée sous un tableau. */
export const Pagination = ({ page, onPageChange }) => {
    const from = page.total === 0 ? 0 : (page.page - 1) * page.limit + 1;
    const to = Math.min(page.page * page.limit, page.total);
    return (_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400", children: [_jsxs("span", { children: [from, "\u2013", to, " sur ", _jsx("strong", { className: "font-semibold text-slate-700 dark:text-slate-200", children: page.total })] }), _jsxs("div", { className: "flex items-center gap-1.5", children: [_jsx(Button, { variant: "secondary", size: "sm", disabled: page.page <= 1, onClick: () => onPageChange(page.page - 1), icon: _jsx(ChevronLeft, { className: "h-3.5 w-3.5" }), children: "Pr\u00E9c\u00E9dent" }), _jsxs("span", { className: "px-1 tabular-nums", children: [page.page, " / ", page.pageCount] }), _jsxs(Button, { variant: "secondary", size: "sm", disabled: page.page >= page.pageCount, onClick: () => onPageChange(page.page + 1), children: ["Suivant", _jsx(ChevronRight, { className: "h-3.5 w-3.5" })] })] })] }));
};
