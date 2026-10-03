import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { TelephonyProvider } from '@modules/telephony/telephony.provider';

/**
 * Protege un webhook entrant d'un fournisseur de telephonie.
 *
 * - Si le fournisseur expose une verification de signature (Twilio), la
 *   signature est recalculee sur l'URL exacte puis comparee.
 * - Sinon (implementation de test), l'acces est interdit en production :
 *   un webhook non signe en production serait une porte d'entree ouverte.
 *
 * @param routePath chemin de la route SANS le prefixe d'API, tel que declare
 *                  dans le controleur (ex. `/voice-calls/twiml/xxx/answer`).
 */
export const assertProviderWebhook = (
  provider: TelephonyProvider,
  configService: ConfigService,
  request: Request,
  signature: string | undefined,
  routePath: string,
): void => {
  if (provider.verifyWebhook) {
    const publicBaseUrl = (configService.get<string>('app.telephony.publicBaseUrl') ?? '').replace(/\/$/, '');
    // L'ordre des parametres entre dans le calcul de la signature : on reutilise
    // la chaine de requete brute telle que recue.
    const originalUrl = request.originalUrl ?? '';
    const queryIndex = originalUrl.indexOf('?');
    const rawQuery = queryIndex >= 0 ? originalUrl.slice(queryIndex) : '';

    const valid = provider.verifyWebhook(
      `${publicBaseUrl}${routePath}${rawQuery}`,
      (request.body as Record<string, unknown>) ?? {},
      signature,
    );

    if (!valid) {
      throw new ForbiddenException({ message: 'Signature de webhook invalide.', code: 'INVALID_SIGNATURE' });
    }
    return;
  }

  const nodeEnv = configService.get<string>('app.nodeEnv') ?? 'development';
  if (nodeEnv === 'production') {
    throw new ForbiddenException({
      message: 'Ce fournisseur de telephonie ne peut pas exposer de webhook en production.',
      code: 'PROVIDER_NOT_ALLOWED',
    });
  }
};
