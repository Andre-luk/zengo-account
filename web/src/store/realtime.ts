import { create } from 'zustand';
import type { RealtimeEvent } from '@/types/api';

type RealtimeHandler = (event: RealtimeEvent) => void;

const handlers = new Set<RealtimeHandler>();

/** Abonnement ponctuel a un événement temps réel (utilisé par les pages). */
export const subscribeToRealtime = (handler: RealtimeHandler): (() => void) => {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
};

export const emitRealtime = (event: RealtimeEvent): void => {
  handlers.forEach((handler) => handler(event));
};

interface RealtimeState {
  connected: boolean;
  connecting: boolean;
  lastEvent: RealtimeEvent | null;
  recentEvents: RealtimeEvent[];
  setConnected: (connected: boolean) => void;
  setConnecting: (connecting: boolean) => void;
  recordEvent: (event: RealtimeEvent) => void;
  reset: () => void;
}

const MAX_RECENT_EVENTS = 40;

export const useRealtimeStore = create<RealtimeState>((set, get) => ({
  connected: false,
  connecting: false,
  lastEvent: null,
  recentEvents: [],

  setConnected: (connected) => set({ connected, connecting: false }),
  setConnecting: (connecting) => set({ connecting }),

  recordEvent: (event) =>
    set({
      lastEvent: event,
      recentEvents: [event, ...get().recentEvents].slice(0, MAX_RECENT_EVENTS),
    }),

  reset: () => set({ connected: false, connecting: false, lastEvent: null, recentEvents: [] }),
}));
