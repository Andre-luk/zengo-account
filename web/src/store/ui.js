import { create } from 'zustand';
import { persist } from 'zustand/middleware';
const applyTheme = (theme) => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme;
};
export const useUiStore = create()(persist((set, get) => ({
    theme: 'light',
    sidebarCollapsed: false,
    alertPanelOpen: false,
    toasts: [],
    toggleTheme: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        set({ theme: next });
    },
    setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
    setAlertPanelOpen: (alertPanelOpen) => set({ alertPanelOpen }),
    pushToast: (toast) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        set({ toasts: [...get().toasts, { ...toast, id }].slice(-4) });
        // Les alertes critiques restent affichees plus longtemps.
        const timeout = toast.tone === 'critical' ? 12000 : 6000;
        window.setTimeout(() => get().dismissToast(id), timeout);
    },
    dismissToast: (id) => set({ toasts: get().toasts.filter((toast) => toast.id !== id) }),
}), {
    name: 'zengo.ui',
    partialize: (state) => ({ theme: state.theme, sidebarCollapsed: state.sidebarCollapsed }),
    onRehydrateStorage: () => (state) => {
        applyTheme(state?.theme ?? 'light');
    },
}));
/** Applique le theme des le demarrage, avant le premier rendu React. */
export const bootstrapTheme = () => {
    try {
        const raw = window.localStorage.getItem('zengo.ui');
        const theme = raw ? (JSON.parse(raw).state?.theme ?? 'light') : 'light';
        applyTheme(theme);
    }
    catch {
        applyTheme('light');
    }
};
