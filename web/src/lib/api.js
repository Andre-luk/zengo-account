import { API_BASE_URL } from '@/lib/format';
export class ApiError extends Error {
    constructor(status, message, code, payload) {
        super(message);
        Object.defineProperty(this, "status", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "code", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "payload", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
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
let tokens = null;
let onSessionExpired = null;
export const setApiTokens = (next) => {
    tokens = next;
};
export const getApiTokens = () => tokens;
export const setSessionExpiredHandler = (handler) => {
    onSessionExpired = handler;
};
let refreshInFlight = null;
/**
 * Repli sur la session persistée : au tout premier rendu, le store Zustand peut
 * ne pas encore avoir ete rehydrate alors qu'une requête part déjà.
 */
const readPersistedTokens = () => {
    try {
        const raw = window.localStorage.getItem('zengo.auth');
        if (!raw)
            return null;
        const parsed = JSON.parse(raw);
        return parsed.state?.tokens ?? null;
    }
    catch {
        return null;
    }
};
const currentTokens = () => tokens ?? readPersistedTokens();
/** Rafraichit la session une seule fois, même si plusieurs requetes echouent en parallele. */
const refreshTokens = async () => {
    const refreshToken = currentTokens()?.refreshToken;
    if (!refreshToken)
        return null;
    if (refreshInFlight)
        return refreshInFlight;
    refreshInFlight = (async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken }),
            });
            if (!response.ok)
                return null;
            const data = (await response.json());
            tokens = { accessToken: data.accessToken, refreshToken: data.refreshToken };
            return tokens;
        }
        catch {
            return null;
        }
        finally {
            refreshInFlight = null;
        }
    })();
    return refreshInFlight;
};
const buildUrl = (path, query) => {
    const url = `${API_BASE_URL}${path}`;
    if (!query)
        return url;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || value === '')
            continue;
        params.append(key, String(value));
    }
    const search = params.toString();
    return search ? `${url}?${search}` : url;
};
const parseBody = async (response) => {
    const text = await response.text();
    if (!text)
        return null;
    try {
        return JSON.parse(text);
    }
    catch {
        return text;
    }
};
const request = async (path, options = {}, isRetry = false) => {
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
        if (refreshed)
            return request(path, options, true);
        onSessionExpired?.();
        throw new ApiError(401, 'Session expirée. Veuillez vous reconnecter.', 'SESSION_EXPIRED');
    }
    const payload = await parseBody(response);
    if (!response.ok) {
        const errorBody = (payload ?? {});
        const rawMessage = errorBody.message ?? `Erreur ${response.status}`;
        const message = Array.isArray(rawMessage) ? rawMessage.join(' ') : rawMessage;
        throw new ApiError(response.status, message, errorBody.code, payload);
    }
    return payload;
};
export const api = {
    get: (path, query) => request(path, { query }),
    post: (path, body, query) => request(path, { method: 'POST', body, query }),
    patch: (path, body) => request(path, { method: 'PATCH', body }),
    /** Certaines ressources utilisent DELETE avec un corps (archivage logique). */
    delete: (path, body) => request(path, { method: 'DELETE', body }),
    login: (body) => request('/auth/login', { method: 'POST', body, skipRefresh: true }),
    logout: (refreshToken) => request('/auth/logout', { method: 'POST', body: { refreshToken } }),
};
