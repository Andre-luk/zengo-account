import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { BellRing, ChevronLeft, LogOut, Menu, Moon, RadioTower, ShieldCheck, Sun, UserRound, } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { formatNumber, initials } from '@/lib/format';
import { NAV_GROUPS, NAV_ITEMS, PAGE_TITLES } from '@/lib/navigation';
import { useAlertStats } from '@/hooks/queries';
import { useAuthStore } from '@/store/auth';
import { useRealtimeStore } from '@/store/realtime';
import { useUiStore } from '@/store/ui';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
const Brand = ({ collapsed }) => (_jsxs("div", { className: "flex items-center gap-2.5 px-3 py-4", children: [_jsx("span", { className: "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm", children: _jsx(ShieldCheck, { className: "h-5 w-5" }) }), !collapsed ? (_jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "truncate text-sm font-semibold text-white", children: "Zengo Account" }), _jsx("p", { className: "truncate text-[11px] text-slate-400", children: "SafAlert Solar G1" })] })) : null] }));
const Sidebar = ({ collapsed, onNavigate, }) => {
    const hasRole = useAuthStore((state) => state.hasRole);
    const isClient = useAuthStore((state) => state.isClient);
    const user = useAuthStore((state) => state.user);
    const logout = useAuthStore((state) => state.logout);
    const navigate = useNavigate();
    const pushToast = useUiStore((state) => state.pushToast);
    const items = useMemo(() => NAV_ITEMS.filter((item) => (item.roles?.length ? hasRole(...item.roles) : true)), [hasRole]);
    const handleLogout = async () => {
        await logout();
        pushToast({ tone: 'neutral', title: 'Déconnexion', description: 'Votre session a été fermée.' });
        navigate('/connexion', { replace: true });
    };
    return (_jsxs("div", { className: "flex h-full flex-col bg-slate-900 text-slate-300", children: [_jsx(Brand, { collapsed: collapsed }), _jsx("nav", { className: "flex-1 space-y-5 overflow-y-auto px-2 pb-4", children: NAV_GROUPS.map((group) => {
                    const groupItems = items.filter((item) => item.group === group.id);
                    if (groupItems.length === 0)
                        return null;
                    return (_jsxs("div", { children: [!collapsed ? (_jsx("p", { className: "px-2 pb-1.5 text-[10px] font-semibold tracking-widest text-slate-500 uppercase", children: group.label })) : null, _jsx("ul", { className: "space-y-0.5", children: groupItems.map((item) => (_jsx("li", { children: _jsxs(NavLink, { to: item.to, onClick: onNavigate, title: collapsed ? item.label : undefined, className: ({ isActive }) => cn('group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors', isActive
                                            ? 'bg-brand-600/95 text-white shadow-sm'
                                            : 'text-slate-300 hover:bg-slate-800 hover:text-white', collapsed && 'justify-center px-2'), children: [_jsx(item.icon, { className: "h-4 w-4 shrink-0" }), !collapsed ? _jsx("span", { className: "truncate", children: item.label }) : null] }) }, item.to))) })] }, group.id));
                }) }), _jsxs("div", { className: "border-t border-slate-800 p-2", children: [!collapsed ? (_jsxs("div", { className: "flex items-center gap-2.5 rounded-lg px-2 py-2", children: [_jsx("span", { className: "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-slate-200", children: initials(user?.firstName, user?.lastName) }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsxs("p", { className: "truncate text-xs font-semibold text-white", children: [user?.firstName, " ", user?.lastName] }), _jsx("p", { className: "truncate text-[11px] text-slate-400", children: isClient() ? 'Espace client' : (user?.roles[0] ?? '').replace(/_/g, ' ') })] })] })) : null, _jsxs("button", { type: "button", onClick: handleLogout, className: cn('mt-1 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-white', collapsed && 'justify-center px-2'), children: [_jsx(LogOut, { className: "h-4 w-4 shrink-0" }), !collapsed ? 'Se deconnecter' : null] })] })] }));
};
const RealtimeIndicator = () => {
    const connected = useRealtimeStore((state) => state.connected);
    const connecting = useRealtimeStore((state) => state.connecting);
    if (connected) {
        return (_jsx(Badge, { tone: "success", dot: true, children: "Temps r\u00E9el actif" }));
    }
    return (_jsx(Badge, { tone: connecting ? 'warning' : 'danger', dot: true, children: connecting ? 'Connexion...' : 'Temps réel interrompu' }));
};
export const AppShell = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const theme = useUiStore((state) => state.theme);
    const toggleTheme = useUiStore((state) => state.toggleTheme);
    const collapsed = useUiStore((state) => state.sidebarCollapsed);
    const setCollapsed = useUiStore((state) => state.setSidebarCollapsed);
    const pushToast = useUiStore((state) => state.pushToast);
    const logout = useAuthStore((state) => state.logout);
    const [mobileOpen, setMobileOpen] = useState(false);
    const { data: stats } = useAlertStats();
    // Ferme le menu mobile a chaque navigation.
    useEffect(() => setMobileOpen(false), [location.pathname]);
    // Replie automatiquement la barre laterale sur petit écran.
    useEffect(() => {
        const onResize = () => setCollapsed(window.innerWidth < 1280);
        onResize();
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [setCollapsed]);
    const pageMeta = useMemo(() => {
        const match = Object.keys(PAGE_TITLES)
            .filter((path) => location.pathname.startsWith(path))
            .sort((a, b) => b.length - a.length)[0];
        return match ? PAGE_TITLES[match] : { title: 'Zengo Account' };
    }, [location.pathname]);
    const openAlerts = stats?.open ?? 0;
    return (_jsxs("div", { className: "flex h-full", children: [_jsx("aside", { className: cn('hidden shrink-0 lg:block', collapsed ? 'w-[68px]' : 'w-64'), children: _jsx("div", { className: cn('fixed inset-y-0 left-0 transition-[width] duration-200', collapsed ? 'w-[68px]' : 'w-64'), children: _jsx(Sidebar, { collapsed: collapsed }) }) }), mobileOpen ? (_jsxs("div", { className: "fixed inset-0 z-50 lg:hidden", children: [_jsx("div", { className: "absolute inset-0 animate-fade-in bg-slate-900/60", onClick: () => setMobileOpen(false) }), _jsx("div", { className: "relative z-10 h-full w-64 animate-slide-in-right", children: _jsx(Sidebar, { collapsed: false, onNavigate: () => setMobileOpen(false) }) })] })) : null, _jsxs("div", { className: "flex min-w-0 flex-1 flex-col", children: [_jsx("header", { className: "sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/85", children: _jsxs("div", { className: "flex items-center gap-3 px-4 py-3 sm:px-6", children: [_jsx(Button, { variant: "ghost", size: "icon", className: "lg:hidden", onClick: () => setMobileOpen(true), "aria-label": "Ouvrir la navigation", children: _jsx(Menu, { className: "h-5 w-5" }) }), _jsx(Button, { variant: "ghost", size: "icon", className: "hidden lg:inline-flex", onClick: () => setCollapsed(!collapsed), "aria-label": collapsed ? 'Deployer la navigation' : 'Replier la navigation', children: _jsx(ChevronLeft, { className: cn('h-4 w-4 transition-transform', collapsed && 'rotate-180') }) }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("h1", { className: "truncate text-base font-semibold text-slate-900 dark:text-white", children: pageMeta.title }), pageMeta.subtitle ? (_jsx("p", { className: "truncate text-xs text-slate-500 dark:text-slate-400", children: pageMeta.subtitle })) : null] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "hidden md:block", children: _jsx(RealtimeIndicator, {}) }), _jsxs("button", { type: "button", onClick: () => navigate('/alertes?openOnly=true'), className: "relative rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white", title: "Alertes ouvertes", children: [_jsx(BellRing, { className: "h-4 w-4" }), openAlerts > 0 ? (_jsx("span", { className: "absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white", children: formatNumber(openAlerts) })) : null] }), _jsx(Button, { variant: "ghost", size: "icon", onClick: toggleTheme, "aria-label": "Basculer le theme", title: theme === 'dark' ? 'Passer en clair' : 'Passer en sombre', children: theme === 'dark' ? _jsx(Sun, { className: "h-4 w-4" }) : _jsx(Moon, { className: "h-4 w-4" }) }), _jsxs("div", { className: "hidden items-center gap-2 border-l border-slate-200 pl-2 sm:flex dark:border-slate-700", children: [_jsx(RadioTower, { className: "h-4 w-4 text-slate-400" }), _jsx(Button, { variant: "ghost", size: "icon", title: "Se deconnecter", onClick: async () => {
                                                        await logout();
                                                        pushToast({ tone: 'neutral', title: 'Déconnexion', description: 'Session fermée.' });
                                                    }, children: _jsx(UserRound, { className: "h-4 w-4" }) })] })] })] }) }), _jsx("main", { className: "app-canvas min-h-0 flex-1 overflow-y-auto", children: _jsx("div", { className: "mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 sm:py-6", children: _jsx(Outlet, {}) }) })] })] }));
};
