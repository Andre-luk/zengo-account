import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ApiError, api, setApiTokens, type ApiTokens } from '@/lib/api';
import type { CurrentUser, LoginResponse, Role } from '@/types/api';

const NATIONAL_ROLES: Role[] = [
  'SUPER_ADMIN',
  'NATIONAL_DIRECTOR',
  'TECHNICAL_DIRECTOR',
  'DAF',
  'QUALITY_DIRECTOR',
];

export type LoginResult =
  | { status: 'authenticated' }
  | { status: 'two_factor_required' }
  | { status: 'error'; message: string };

interface AuthState {
  user: CurrentUser | null;
  tokens: ApiTokens | null;
  /** Identifiants conserves le temps de saisir le code a deux facteurs. */
  pendingIdentifier: string | null;
  /** Vrai une fois la session restaurée depuis le stockage local. */
  hydrated: boolean;

  login: (identifier: string, password: string, totpCode?: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  clearSession: () => void;

  isAuthenticated: () => boolean;
  hasRole: (...roles: Role[]) => boolean;
  isClient: () => boolean;
  isNationalScope: () => boolean;
  accessibleOrganizationIds: string[];
  primaryOrganizationName: string | null;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      tokens: null,
      pendingIdentifier: null,
      hydrated: false,

      login: async (identifier, password, totpCode) => {
        try {
          const response = await api.login<LoginResponse>({
            identifier,
            password,
            ...(totpCode ? { totpCode } : {}),
          });

          const nextTokens: ApiTokens = {
            accessToken: response.accessToken,
            refreshToken: response.refreshToken,
          };
          setApiTokens(nextTokens);
          set({ user: response.user, tokens: nextTokens, pendingIdentifier: null });

          return { status: 'authenticated' };
        } catch (error) {
          if (error instanceof ApiError) {
            if (error.code === 'TWO_FACTOR_REQUIRED') {
              set({ pendingIdentifier: identifier });
              return { status: 'two_factor_required' };
            }
            return { status: 'error', message: error.message };
          }
          return { status: 'error', message: 'Connexion impossible. Vérifiez le réseau.' };
        }
      },

      logout: async () => {
        const { tokens } = get();
        if (tokens?.refreshToken) {
          // La revocation est best-effort : on nettoie la session locale dans tous les cas.
          await api.logout(tokens.refreshToken).catch(() => undefined);
        }
        setApiTokens(null);
        set({ user: null, tokens: null, pendingIdentifier: null });
      },

      refreshProfile: async () => {
        const user = await api.get<CurrentUser>('/users/me');
        set({ user });
      },

      clearSession: () => {
        setApiTokens(null);
        set({ user: null, tokens: null, pendingIdentifier: null });
      },

      isAuthenticated: () => Boolean(get().tokens?.accessToken && get().user),
      hasRole: (...roles) => {
        const user = get().user;
        if (!user) return false;
        if (user.isSuperAdmin) return true;
        return roles.some((role) => user.roles.includes(role));
      },
      isClient: () => {
        const user = get().user;
        if (!user || user.isSuperAdmin) return false;
        return user.roles.length > 0 && user.roles.every((role) => role === 'CLIENT' || role === 'CLIENT_ADMIN');
      },
      isNationalScope: () => {
        const user = get().user;
        if (!user) return false;
        if (user.isSuperAdmin) return true;
        return user.roles.some((role) => NATIONAL_ROLES.includes(role));
      },
      get accessibleOrganizationIds() {
        return get().user?.memberships.map((membership) => membership.organizationId) ?? [];
      },
      get primaryOrganizationName() {
        const user = get().user;
        if (!user) return null;
        const primary = user.memberships.find((membership) => membership.isPrimary) ?? user.memberships[0];
        return primary?.organizationName ?? null;
      },
    }),
    {
      name: 'zengo.auth',
      // L'hydratation est déclenchée explicitement avant le premier rendu
      // (cf. `bootstrapAuth`) pour eviter un rendu « deconnecte » transitoire.
      skipHydration: true,
      partialize: (state) => ({ user: state.user, tokens: state.tokens }),
      onRehydrateStorage: () => (state) => {
        // Restaure la session a l'ouverture d'un nouvel onglet.
        if (state?.tokens) setApiTokens(state.tokens);
        useAuthStore.setState({ hydrated: true });
      },
    },
  ),
);

/** Restaure la session persistée avant le premier rendu de l'application. */
export const bootstrapAuth = async (): Promise<void> => {
  try {
    await useAuthStore.persist.rehydrate();
  } catch {
    setApiTokens(null);
  } finally {
    useAuthStore.setState({ hydrated: true });
  }
};
