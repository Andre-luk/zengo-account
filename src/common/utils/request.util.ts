import { Request } from 'express';

/** Extrait l'adresse IP cliente en tenant compte des proxys (X-Forwarded-For). */
export const extractIpAddress = (request: Request): string | null => {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0];
  }
  return request.ip ?? request.socket?.remoteAddress ?? null;
};

export const extractUserAgent = (request: Request): string | null => {
  const agent = request.headers['user-agent'];
  return typeof agent === 'string' ? agent.slice(0, 255) : null;
};
