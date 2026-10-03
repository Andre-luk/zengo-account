import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { setSessionExpiredHandler } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useUiStore } from '@/store/ui';
import { AlertsPage } from '@/routes/AlertsPage';
import { AuditPage } from '@/routes/AuditPage';
import { ClientDetailPage } from '@/routes/ClientDetailPage';
import { ClientsPage } from '@/routes/ClientsPage';
import { DashboardPage } from '@/routes/DashboardPage';
import { DeviceDetailPage } from '@/routes/DeviceDetailPage';
import { DevicesPage } from '@/routes/DevicesPage';
import { ForbiddenPage, NotFoundPage } from '@/routes/FallbackPages';
import { LoginPage } from '@/routes/LoginPage';
import { OrganizationsPage } from '@/routes/OrganizationsPage';
import { TariffsPage } from '@/routes/TariffsPage';
import { UsersPage } from '@/routes/UsersPage';
/** Redirige vers la connexion si la session n'est pas active. */
const RequireAuth = ({ children }) => {
    const isAuthenticated = useAuthStore((state) => Boolean(state.tokens?.accessToken));
    if (!isAuthenticated)
        return _jsx(Navigate, { to: "/connexion", replace: true });
    return children;
};
/** Restreint une page aux roles autorises. */
const RequireRole = ({ roles, children }) => {
    const hasRole = useAuthStore((state) => state.hasRole);
    if (!hasRole(...roles))
        return _jsx(ForbiddenPage, {});
    return children;
};
export const App = () => {
    const clearSession = useAuthStore((state) => state.clearSession);
    const pushToast = useUiStore((state) => state.pushToast);
    useEffect(() => {
        setSessionExpiredHandler(() => {
            clearSession();
            pushToast({
                tone: 'warning',
                title: 'Session expirée',
                description: 'Veuillez vous reconnecter pour poursuivre.',
            });
        });
        return () => setSessionExpiredHandler(null);
    }, [clearSession, pushToast]);
    return (_jsxs(Routes, { children: [_jsx(Route, { path: "/connexion", element: _jsx(LoginPage, {}) }), _jsxs(Route, { element: _jsx(RequireAuth, { children: _jsx(AppShell, {}) }), children: [_jsx(Route, { path: "/", element: _jsx(Navigate, { to: "/tableau-de-bord", replace: true }) }), _jsx(Route, { path: "/tableau-de-bord", element: _jsx(DashboardPage, {}) }), _jsx(Route, { path: "/alertes", element: _jsx(AlertsPage, {}) }), _jsx(Route, { path: "/alertes/:alertId", element: _jsx(AlertsPage, {}) }), _jsx(Route, { path: "/clients", element: _jsx(ClientsPage, {}) }), _jsx(Route, { path: "/clients/:clientId", element: _jsx(ClientDetailPage, {}) }), _jsx(Route, { path: "/dispositifs", element: _jsx(DevicesPage, {}) }), _jsx(Route, { path: "/dispositifs/:deviceId", element: _jsx(DeviceDetailPage, {}) }), _jsx(Route, { path: "/tarifs", element: _jsx(RequireRole, { roles: ['SUPER_ADMIN', 'NATIONAL_DIRECTOR', 'TECHNICAL_DIRECTOR', 'DAF', 'ACCOUNTANT', 'PLATFORM_MANAGER', 'REGION_MANAGER', 'AGENCY_MANAGER'], children: _jsx(TariffsPage, {}) }) }), _jsx(Route, { path: "/organisations", element: _jsx(RequireRole, { roles: ['SUPER_ADMIN', 'NATIONAL_DIRECTOR', 'TECHNICAL_DIRECTOR', 'PLATFORM_MANAGER', 'REGION_MANAGER', 'AGENCY_MANAGER'], children: _jsx(OrganizationsPage, {}) }) }), _jsx(Route, { path: "/utilisateurs", element: _jsx(RequireRole, { roles: ['SUPER_ADMIN', 'NATIONAL_DIRECTOR', 'TECHNICAL_DIRECTOR', 'PLATFORM_MANAGER', 'REGION_MANAGER', 'AGENCY_MANAGER'], children: _jsx(UsersPage, {}) }) }), _jsx(Route, { path: "/journal", element: _jsx(RequireRole, { roles: ['SUPER_ADMIN', 'NATIONAL_DIRECTOR', 'QUALITY_DIRECTOR', 'DAF'], children: _jsx(AuditPage, {}) }) }), _jsx(Route, { path: "*", element: _jsx(NotFoundPage, {}) })] })] }));
};
