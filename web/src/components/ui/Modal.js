import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { X } from 'lucide-react';
import { useEffect } from 'react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
const SIZES = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
};
export const Modal = ({ open, onClose, title, description, children, footer, size = 'md' }) => {
    useEffect(() => {
        if (!open)
            return undefined;
        const onKeyDown = (event) => {
            if (event.key === 'Escape')
                onClose();
        };
        document.addEventListener('keydown', onKeyDown);
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.body.style.overflow = '';
        };
    }, [open, onClose]);
    if (!open)
        return null;
    return (_jsxs("div", { className: "fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6", role: "dialog", "aria-modal": true, children: [_jsx("div", { className: "absolute inset-0 animate-fade-in bg-slate-900/50 backdrop-blur-sm", onClick: onClose }), _jsxs("div", { className: cn('relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-panel animate-slide-up sm:rounded-2xl dark:bg-slate-900', SIZES[size]), children: [_jsxs("header", { className: "flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800", children: [_jsxs("div", { className: "min-w-0", children: [_jsx("h2", { className: "text-base font-semibold text-slate-900 dark:text-white", children: title }), description ? (_jsx("p", { className: "mt-0.5 text-sm text-slate-500 dark:text-slate-400", children: description })) : null] }), _jsx(Button, { variant: "ghost", size: "icon", onClick: onClose, "aria-label": "Fermer", children: _jsx(X, { className: "h-4 w-4" }) })] }), _jsx("div", { className: "min-h-0 flex-1 overflow-y-auto px-5 py-4", children: children }), footer ? (_jsx("footer", { className: "flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-900/60", children: footer })) : null] })] }));
};
const DRAWER_WIDTHS = {
    md: 'sm:max-w-xl',
    lg: 'sm:max-w-2xl',
    xl: 'sm:max-w-4xl',
};
/** Panneau latéral glissant : utilisé pour le détail d'une alerte. */
export const Drawer = ({ open, onClose, children, width = 'lg' }) => {
    useEffect(() => {
        if (!open)
            return undefined;
        const onKeyDown = (event) => {
            if (event.key === 'Escape')
                onClose();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [open, onClose]);
    if (!open)
        return null;
    return (_jsxs("div", { className: "fixed inset-0 z-40 flex justify-end", role: "dialog", "aria-modal": true, children: [_jsx("div", { className: "absolute inset-0 animate-fade-in bg-slate-900/40 backdrop-blur-sm", onClick: onClose }), _jsx("aside", { className: cn('relative z-10 flex h-full w-full flex-col overflow-hidden bg-slate-50 shadow-panel animate-slide-in-right dark:bg-slate-950', DRAWER_WIDTHS[width]), children: children })] }));
};
