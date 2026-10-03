import { format, formatDistanceToNowStrict, isValid, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { Currency } from '@/types/api';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

/** Serveur temps reel : meme origine en developpement (proxy Vite). */
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin;

const toDate = (value: string | Date | null | undefined): Date | null => {
  if (!value) return null;
  const date = typeof value === 'string' ? parseISO(value) : value;
  return isValid(date) ? date : null;
};

export const formatDateTime = (value: string | Date | null | undefined): string => {
  const date = toDate(value);
  return date ? format(date, 'dd/MM/yyyy HH:mm:ss', { locale: fr }) : '—';
};

export const formatShortDateTime = (value: string | Date | null | undefined): string => {
  const date = toDate(value);
  return date ? format(date, 'dd/MM HH:mm', { locale: fr }) : '—';
};

export const formatTime = (value: string | Date | null | undefined): string => {
  const date = toDate(value);
  return date ? format(date, 'HH:mm:ss', { locale: fr }) : '—';
};

export const formatDate = (value: string | Date | null | undefined): string => {
  const date = toDate(value);
  return date ? format(date, 'dd/MM/yyyy', { locale: fr }) : '—';
};

/** « il y a 3 minutes », « dans 2 heures ». */
export const formatRelative = (value: string | Date | null | undefined): string => {
  const date = toDate(value);
  if (!date) return '—';
  return formatDistanceToNowStrict(date, { locale: fr, addSuffix: true });
};

/** Durée en secondes -> « 2 min 15 s ». */
export const formatDuration = (seconds: number | null | undefined): string => {
  if (seconds === null || seconds === undefined) return '—';
  if (seconds < 60) return `${Math.round(seconds)} s`;

  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  if (minutes < 60) return remaining > 0 ? `${minutes} min ${remaining} s` : `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  return `${hours} h ${String(minutes % 60).padStart(2, '0')}`;
};

/** Distance en mètres -> « 850 m » ou « 12,4 km ». */
export const formatDistance = (meters: number | null | undefined): string => {
  if (meters === null || meters === undefined) return '—';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(meters / 1000)} km`;
};

const usdFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

const cdfFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'CDF',
  maximumFractionDigits: 0,
});

export const formatMoney = (amount: number | null | undefined, currency: Currency = 'USD'): string => {
  if (amount === null || amount === undefined) return '—';
  return currency === 'CDF' ? cdfFormatter.format(amount) : usdFormatter.format(amount);
};

export const formatNumber = (value: number | null | undefined): string =>
  value === null || value === undefined ? '—' : new Intl.NumberFormat('fr-FR').format(value);

/** Coordonnees GPS lisibles. */
export const formatCoordinates = (
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): string => {
  if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) {
    return '—';
  }
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
};

export const initials = (firstName?: string | null, lastName?: string | null): string =>
  `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || '?';
