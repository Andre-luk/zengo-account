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
import { MissionsPage } from '@/routes/MissionsPage';
import { SubscriptionsPage } from '@/routes/SubscriptionsPage';
import { MutationsPage } from '@/routes/MutationsPage';
import { HealthPage } from '@/routes/HealthPage';
import { OrganizationsPage } from '@/routes/OrganizationsPage';
import { SimulationPage } from '@/routes/SimulationPage';
import { TariffsPage } from '@/routes/TariffsPage';
import { UsersPage } from '@/routes/UsersPage';
import type { Role } from '@/types/api';

/** Redirige vers la connexion si la session n'est pas active. */
const RequireAuth = ({ children }: { children: JSX.Element }) => {
  const hydrated = useAuthStore((state) => state.hydrated);
  const isAuthenticated = useAuthStore((state) => Boolean(state.tokens?.accessToken));

  // Tant que la session persistee n'est pas restauree, on ne decide rien.
  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 dark:bg-slate-950">
        <p className="text-sm text-slate-500 dark:text-slate-400">Restauration de la session…</p>
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/connexion" replace />;
  return children;
};

/** Restreint une page aux roles autorises. */
const RequireRole = ({ roles, children }: { roles: Role[]; children: JSX.Element }) => {
  const hasRole = useAuthStore((state) => state.hasRole);
  if (!hasRole(...roles)) return <ForbiddenPage />;
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

  return (
    <Routes>
      <Route path="/connexion" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Navigate to="/tableau-de-bord" replace />} />
        <Route path="/tableau-de-bord" element={<DashboardPage />} />
        <Route path="/alertes" element={<AlertsPage />} />
        <Route path="/alertes/:alertId" element={<AlertsPage />} />
        <Route path="/missions" element={<MissionsPage />} />
        <Route path="/missions/:missionId" element={<MissionsPage />} />
        <Route
          path="/abonnements"
          element={
            <RequireRole
              roles={[
                'SUPER_ADMIN',
                'NATIONAL_DIRECTOR',
                'TECHNICAL_DIRECTOR',
                'PLATFORM_MANAGER',
                'DAF',
                'ACCOUNTANT',
                'REGION_MANAGER',
                'AGENCY_MANAGER',
                'OPERATOR',
                'SUPERVISOR',
              ]}
            >
              <SubscriptionsPage />
            </RequireRole>
          }
        />
        <Route
          path="/mutations"
          element={
            <RequireRole
              roles={[
                'SUPER_ADMIN',
                'NATIONAL_DIRECTOR',
                'TECHNICAL_DIRECTOR',
                'PLATFORM_MANAGER',
                'QUALITY_DIRECTOR',
                'REGION_MANAGER',
                'AGENCY_MANAGER',
                'OPERATOR',
                'SUPERVISOR',
              ]}
            >
              <MutationsPage />
            </RequireRole>
          }
        />
        <Route
          path="/sante"
          element={
            <RequireRole
              roles={[
                'SUPER_ADMIN',
                'NATIONAL_DIRECTOR',
                'TECHNICAL_DIRECTOR',
                'HEALTH_STAFF',
              ]}
            >
              <HealthPage />
            </RequireRole>
          }
        />
        <Route path="/clients" element={<ClientsPage />} />
        <Route path="/clients/:clientId" element={<ClientDetailPage />} />
        <Route
          path="/simulation"
          element={
            <RequireRole
              roles={[
                'SUPER_ADMIN',
                'NATIONAL_DIRECTOR',
                'TECHNICAL_DIRECTOR',
                'PLATFORM_MANAGER',
                'OPERATOR',
                'SUPERVISOR',
              ]}
            >
              <SimulationPage />
            </RequireRole>
          }
        />
        <Route path="/dispositifs" element={<DevicesPage />} />
        <Route path="/dispositifs/:deviceId" element={<DeviceDetailPage />} />
        <Route
          path="/tarifs"
          element={
            <RequireRole roles={['SUPER_ADMIN', 'NATIONAL_DIRECTOR', 'TECHNICAL_DIRECTOR', 'DAF', 'ACCOUNTANT', 'PLATFORM_MANAGER', 'REGION_MANAGER', 'AGENCY_MANAGER']}>
              <TariffsPage />
            </RequireRole>
          }
        />
        <Route
          path="/organisations"
          element={
            <RequireRole roles={['SUPER_ADMIN', 'NATIONAL_DIRECTOR', 'TECHNICAL_DIRECTOR', 'PLATFORM_MANAGER', 'REGION_MANAGER', 'AGENCY_MANAGER']}>
              <OrganizationsPage />
            </RequireRole>
          }
        />
        <Route
          path="/utilisateurs"
          element={
            <RequireRole roles={['SUPER_ADMIN', 'NATIONAL_DIRECTOR', 'TECHNICAL_DIRECTOR', 'PLATFORM_MANAGER', 'REGION_MANAGER', 'AGENCY_MANAGER']}>
              <UsersPage />
            </RequireRole>
          }
        />
        <Route
          path="/journal"
          element={
            <RequireRole roles={['SUPER_ADMIN', 'NATIONAL_DIRECTOR', 'QUALITY_DIRECTOR', 'DAF']}>
              <AuditPage />
            </RequireRole>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
};
