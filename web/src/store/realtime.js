import { create } from 'zustand';
const handlers = new Set();
/** Abonnement ponctuel a un événement temps réel (utilisé par les pages). */
export const subscribeToRealtime = (handler) => {
    handlers.add(handler);
    return () => {
        handlers.delete(handler);
    };
};
export const emitRealtime = (event) => {
    handlers.forEach((handler) => handler(event));
};
const MAX_RECENT_EVENTS = 40;
export const useRealtimeStore = create((set, get) => ({
    connected: false,
    connecting: false,
    lastEvent: null,
    recentEvents: [],
    setConnected: (connected) => set({ connected, connecting: false }),
    setConnecting: (connecting) => set({ connecting }),
    recordEvent: (event) => set({
        lastEvent: event,
        recentEvents: [event, ...get().recentEvents].slice(0, MAX_RECENT_EVENTS),
    }),
    reset: () => set({ connected: false, connecting: false, lastEvent: null, recentEvents: [] }),
}));
