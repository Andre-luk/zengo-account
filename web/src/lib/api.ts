import { API_BASE_URL } from '@/lib/format';

export interface ApiTokens {
  accessToken: string;
  refreshToken: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly payload: unknown;

  constructor(status: number, message: string, code?: string, payload?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

/**
 * Jetons conserves hors du store React pour que le client HTTP puisse les
 * utiliser sans dependance circulaire.
 */
let tokens: ApiTokens | null = null;
let onSessionExpired: (() => void) | null = null;

export const setApiTokens = (next: ApiTokens | null): void => {
  tokens = next;
};

export const getApiTokens = (): ApiTokens | null => tokens;

export const setSessionExpiredHandler = (handler: (() => void) | null): void => {
  onSessionExpired = handler;
};

let refreshInFlight: Promise<ApiTokens | null> | null = null;

/**
 * Repli sur la session persistée : au tout premier rendu, le store Zustand peut
 * ne pas encore avoir ete rehydrate alors qu'une requête part déjà.
 */
const readPersistedTokens = (): ApiTokens | null => {
  try {
    const raw = window.localStorage.getItem('zengo.auth');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { tokens?: ApiTokens | null } };
    return parsed.state?.tokens ?? null;
  } catch {
    return null;
  }
};

const currentTokens = (): ApiTokens | null => tokens ?? readPersistedTokens();

/** Rafraichit la session une seule fois, même si plusieurs requetes echouent en parallele. */
const refreshTokens = async (): Promise<ApiTokens | null> => {
  const refreshToken = currentTokens()?.refreshToken;
  if (!refreshToken) return null;
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) return null;

      const data = (await response.json()) as { accessToken: string; refreshToken: string };
      tokens = { accessToken: data.accessToken, refreshToken: data.refreshToken };
      return tokens;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
};

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Désactivé la tentative de rafraîchissement (utilisé par le login). */
  skipRefresh?: boolean;
  /** Réponse brute (ex. TwiML). */
  raw?: boolean;
}

const buildUrl = (path: string, query?: RequestOptions['query']): string => {
  const url = `${API_BASE_URL}${path}`;
  if (!query) return url;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.append(key, String(value));
  }
  const search = params.toString();
  return search ? `${url}?${search}` : url;
};

const parseBody = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const request = async <T>(path: string, options: RequestOptions = {}, isRetry = false): Promise<T> => {
  const authToken = currentTokens()?.accessToken ?? null;

  const response = await fetch(buildUrl(path, options.query), {
    method: options.method ?? 'GET',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

  if (response.status === 401 && !options.skipRefresh && !isRetry && authToken) {
    const refreshed = await refreshTokens();
    if (refreshed) return request<T>(path, options, true);

    onSessionExpired?.();
    throw new ApiError(401, 'Session expirée. Veuillez vous reconnecter.', 'SESSION_EXPIRED');
  }

  const payload = await parseBody(response);

  if (!response.ok) {
    const errorBody = (payload ?? {}) as { message?: string | string[]; code?: string };
    const rawMessage = errorBody.message ?? `Erreur ${response.status}`;
    const message = Array.isArray(rawMessage) ? rawMessage.join(' ') : rawMessage;
    throw new ApiError(response.status, message, errorBody.code, payload);
  }

  return payload as T;
};

/**
 * Télécharge un contenu binaire protégé (enregistrement d'appel, export...).
 *
 * Le jeton n'est pas mis dans l'URL — il voyagerait dans les journaux du
 * serveur et l'historique du navigateur — on le passe donc en en-tête via
 * `fetch`, exactement comme pour le reste de l'API.
 */
const requestBlob = async (path: string, isRetry = false): Promise<Blob> => {
  const authToken = currentTokens()?.accessToken ?? null;

  const response = await fetch(buildUrl(path), {
    headers: { ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
  });

  if (response.status === 401 && !isRetry && authToken) {
    const refreshed = await refreshTokens();
    if (refreshed) return requestBlob(path, true);

    onSessionExpired?.();
    throw new ApiError(401, 'Session expirée. Veuillez vous reconnecter.', 'SESSION_EXPIRED');
  }

  if (!response.ok) {
    const payload = (await parseBody(response)) as
      | { message?: string | string[]; code?: string }
      | null;
    const rawMessage = payload?.message ?? `Erreur ${response.status}`;
    throw new ApiError(
      response.status,
      Array.isArray(rawMessage) ? rawMessage.join(' ') : rawMessage,
      payload?.code,
      payload,
    );
  }

  return response.blob();
};

export const api = {
  get: <T>(path: string, query?: RequestOptions['query']) => request<T>(path, { query }),
  post: <T>(path: string, body?: unknown, query?: RequestOptions['query']) =>
    request<T>(path, { method: 'POST', body, query }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  /** Certaines ressources utilisent DELETE avec un corps (archivage logique). */
  delete: <T>(path: string, body?: unknown) => request<T>(path, { method: 'DELETE', body }),
  getBlob: (path: string) => requestBlob(path),
  login: <T>(body: unknown) => request<T>('/auth/login', { method: 'POST', body, skipRefresh: true }),
  logout: (refreshToken: string) => request<{ success: boolean }>('/auth/logout', { method: 'POST', body: { refreshToken } }),
};
