import { registerAs } from '@nestjs/config';

const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const toBool = (value: string | undefined, fallback = false): boolean => {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

const toList = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: toInt(process.env.PORT, 3000),
  apiPrefix: process.env.API_PREFIX ?? 'api/v1',
  appName: process.env.APP_NAME ?? 'Zengo Account',
  appUrl: process.env.APP_URL ?? 'http://localhost:3000',
  corsOrigins: toList(process.env.CORS_ORIGINS),

  database: {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: toInt(process.env.DB_PORT, 5432),
    username: process.env.DB_USERNAME ?? 'zengo',
    password: process.env.DB_PASSWORD ?? 'zengo',
    name: process.env.DB_NAME ?? 'zengo_account',
    synchronize: toBool(process.env.DB_SYNCHRONIZE, true),
    logging: toBool(process.env.DB_LOGGING, false),
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret-change-me',
    accessTtl: toInt(process.env.JWT_ACCESS_TTL, 900),
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret-change-me',
    refreshTtl: toInt(process.env.JWT_REFRESH_TTL, 2_592_000),
  },

  security: {
    bcryptSaltRounds: toInt(process.env.BCRYPT_SALT_ROUNDS, 10),
  },

  throttle: {
    ttl: toInt(process.env.THROTTLE_TTL, 60),
    limit: toInt(process.env.THROTTLE_LIMIT, 120),
  },

  mqtt: {
    enabled: toBool(process.env.MQTT_ENABLED, false),
    url: process.env.MQTT_URL ?? 'mqtt://localhost:1883',
    username: process.env.MQTT_USERNAME || undefined,
    password: process.env.MQTT_PASSWORD || undefined,
    topicPrefix: process.env.MQTT_TOPIC_PREFIX ?? 'sg',
  },

  alerts: {
    /** Temporisation du CDC : 5 minutes sans action avant escalade. */
    escalationSeconds: toInt(process.env.ALERT_ESCALATION_SECONDS, 300),
    /** Frequence du watchdog d'escalade. */
    watchdogIntervalSeconds: toInt(process.env.ALERT_WATCHDOG_INTERVAL_SECONDS, 30),
    /** Fenetre de regroupement des declenchements repetitifs d'un meme capteur. */
    groupingWindowSeconds: toInt(process.env.ALERT_GROUPING_WINDOW_SECONDS, 120),
    /** Declenche l'appel vocal IA a la creation d'une alerte capteur. */
    autoVoiceCall: toBool(process.env.ALERT_AUTO_VOICE_CALL, true),
  },

  telephony: {
    provider: (process.env.TELEPHONY_PROVIDER ?? 'STUB').toUpperCase(),
    /** Base publique incluant le prefixe d'API (utilisee pour TwiML et webhooks). */
    publicBaseUrl: process.env.TELEPHONY_PUBLIC_BASE_URL ?? 'http://localhost:3000/api/v1',
    /** Delai maximal sans reponse avant de considerer l'appel sans reponse. */
    callTimeoutSeconds: toInt(process.env.VOICE_CALL_TIMEOUT_SECONDS, 45),
    /** Nombre de tentatives d'appel avant escalade. */
    maxAttempts: toInt(process.env.VOICE_CALL_MAX_ATTEMPTS, 1),
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID ?? '',
      authToken: process.env.TWILIO_AUTH_TOKEN ?? '',
      fromNumber: process.env.TWILIO_FROM_NUMBER ?? '',
    },
  },

  devices: {
    /** Delai sans heartbeat avant de marquer un dispositif hors ligne. */
    offlineAfterSeconds: toInt(process.env.DEVICE_OFFLINE_AFTER_SECONDS, 300),
    presenceIntervalSeconds: toInt(process.env.DEVICE_PRESENCE_INTERVAL_SECONDS, 60),
  },
}));
