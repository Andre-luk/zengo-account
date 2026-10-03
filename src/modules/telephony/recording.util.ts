/**
 * Regles de securite applicables a la relecture des enregistrements d'appels.
 *
 * Le serveur ne relaie un enregistrement que s'il est hebergé par un tiers de
 * confiance explicite : sans ce filtre, une URL fournie par un webhook
 * permettrait de faire relayer par la plateforme n'importe quelle ressource
 * interne (SSRF).
 */

export interface RecordingUrlOptions {
  /** Hôtes autorises par configuration (TELEPHONY_RECORDING_ALLOWED_HOSTS). */
  allowedHosts: string[];
  /** Le fournisseur d'appel courant (seul Twilio est relaye par defaut). */
  providerName: string;
}

const TWILIO_RECORDING_HOSTS = ['api.twilio.com'];

/** Un enregistrement ne se relit que s'il vient de Twilio ou d'un hôte declare. */
export const isProxyableRecordingUrl = (
  url: string | null | undefined,
  options: RecordingUrlOptions,
): boolean => {
  if (!url) return false;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  // `file:`, `ftp:` et consorts ne sont jamais relayes.
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;

  const host = parsed.hostname.toLowerCase();
  const allowed = new Set(
    options.allowedHosts.map((entry) => entry.trim().toLowerCase()).filter(Boolean),
  );

  if (allowed.has(host)) return true;
  return options.providerName.toUpperCase() === 'TWILIO' && TWILIO_RECORDING_HOSTS.includes(host);
};

/** Type de contenu renvoye au navigateur, a defaut d'information fournisseur. */
export const guessAudioContentType = (contentType: string | null | undefined): string => {
  if (!contentType) return 'audio/mpeg';
  return contentType.toLowerCase().includes('wav') ? 'audio/wav' : 'audio/mpeg';
};
