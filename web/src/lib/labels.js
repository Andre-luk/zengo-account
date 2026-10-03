const described = (label, tone = 'neutral') => ({ label, tone });
// --- Alertes -----------------------------------------------------------------
export const ALERT_TYPE = {
    INTRUSION: described('Intrusion', 'warning'),
    FIRE: described('Incendie', 'critical'),
    MEDICAL: described('Urgence médicale', 'critical'),
    SABOTAGE: described('Sabotage', 'danger'),
    PANIC: described('Bouton panique', 'critical'),
    GAS_LEAK: described('Fuite de gaz', 'critical'),
    WATER_LEAK: described("Fuite d'eau", 'info'),
    SYSTEM: described('Incident système', 'neutral'),
};
export const ALERT_SEVERITY = {
    LOW: described('Faible', 'neutral'),
    MEDIUM: described('Moyenne', 'info'),
    HIGH: described('Élevée', 'warning'),
    CRITICAL: described('Critique', 'critical'),
};
export const ALERT_STATUS = {
    NEW: described('Nouvelle', 'critical'),
    ACKNOWLEDGED: described('Prise en charge', 'info'),
    ASSIGNED: described('Équipe engagée', 'brand'),
    IN_PROGRESS: described('Intervention en cours', 'warning'),
    RESOLVED: described('Résolue', 'success'),
    FALSE_ALARM: described('Faux positif', 'neutral'),
    CANCELLED: described('Annulée', 'neutral'),
};
export const ALERT_SOURCE = {
    SENSOR: described('Capteur', 'brand'),
    SOS_BUTTON: described('Bouton SOS', 'danger'),
    CLIENT_APP: described('Application client', 'info'),
    OPERATOR: described('Opérateur', 'neutral'),
    AUTOMATION: described('Automatique', 'neutral'),
};
export const ALERT_RESOLUTION = {
    CLIENT_CONFIRMED: described('Confirme par le client', 'neutral'),
    HANDLED_BY_TEAM: described('Traité par une équipe', 'success'),
    NO_ACTION_REQUIRED: described('Aucune action nécessaire', 'neutral'),
    TECHNICAL_ISSUE: described('Incident technique', 'info'),
    MAINTENANCE_TEST: described('Test de maintenance', 'neutral'),
};
export const ALERT_EVENT = {
    CREATED: described('Alerte déclenchée', 'critical'),
    ACKNOWLEDGED: described('Prise en charge', 'info'),
    DISPATCHED: described('Mission transmise', 'brand'),
    ESCALATED: described('Escalade', 'critical'),
    VOICE_CALL_STARTED: described('Appel vocal lance', 'brand'),
    VOICE_CALL_UPDATED: described('Appel vocal', 'info'),
    VOICE_CALL_COMPLETED: described('Réponse du client', 'success'),
    STATUS_CHANGED: described('Changement de statut', 'info'),
    NOTE_ADDED: described('Note', 'neutral'),
    RESOLVED: described('Clôture', 'success'),
    CANCELLED: described('Annulation', 'neutral'),
};
export const DISPATCH_STATUS = {
    PENDING: described('En attente', 'warning'),
    NOTIFIED: described('Notifiée', 'info'),
    ACKNOWLEDGED: described('Accusée', 'brand'),
    DECLINED: described('Refusée', 'danger'),
    ARRIVED: described('Sur place', 'warning'),
    COMPLETED: described('Terminée', 'success'),
};
export const VOICE_CALL_STATUS = {
    QUEUED: described('En file', 'neutral'),
    RINGING: described('Sonnerie', 'info'),
    IN_PROGRESS: described('En cours', 'brand'),
    COMPLETED: described('Terminé', 'success'),
    NO_ANSWER: described('Sans réponse', 'warning'),
    BUSY: described('Occupe', 'warning'),
    FAILED: described('Échec', 'danger'),
};
export const VOICE_CALL_OUTCOME = {
    NO_ANSWER: described('Sans réponse', 'warning'),
    CONFIRMED_BY_CLIENT: described("C'est le client", 'success'),
    INTRUSION_CONFIRMED: described('Intrusion confirmée', 'critical'),
    PARTIAL: described('Réponse partielle', 'info'),
    FAILED: described('Échec', 'danger'),
};
// --- Clients -----------------------------------------------------------------
export const CLIENT_STATUS = {
    PENDING: described('En attente', 'warning'),
    ACTIVE: described('Actif', 'success'),
    SUSPENDED: described('Suspendu', 'danger'),
    EXPIRED: described('Abonnement expire', 'warning'),
    ARCHIVED: described('Archive', 'neutral'),
};
export const SUBSCRIPTION_STATUS = {
    PENDING: described('En attente', 'warning'),
    ACTIVE: described('Actif', 'success'),
    EXPIRED: described('Expire', 'danger'),
    SUSPENDED: described('Suspendu', 'danger'),
};
export const OFFER_PACK = {
    STANDARD: described('Standard', 'neutral'),
    PREMIUM_SMALL: described('Premium Small', 'info'),
    PREMIUM_INSTITUTION: described('Premium Institutions', 'brand'),
    CUSTOM: described('Sur-mesure', 'warning'),
};
// --- Dispositifs -------------------------------------------------------------
export const DEVICE_STATUS = {
    PROVISIONED: described('Approvisionné', 'info'),
    ACTIVE: described('En ligne', 'success'),
    OFFLINE: described('Hors ligne', 'danger'),
    DISABLED: described('Désactivé', 'neutral'),
};
export const ARM_MODE = {
    '0': described('Désarmé', 'neutral'),
    '1': described('Armé (absence)', 'success'),
    '2': described('Armé (partiel)', 'info'),
};
export const SUB_DEVICE_CODE = {
    DC: described('Contact de porte', 'brand'),
    PIR: described('Détecteur de mouvement', 'brand'),
    WSD: described('Détecteur de fumée', 'critical'),
    GLS: described('Détecteur de gaz', 'critical'),
    WOS: described('Sirène extérieure', 'info'),
    WIS: described('Sirène intérieure', 'info'),
    WLS: described("Détecteur d'eau", 'info'),
    CON: described('Télécommande', 'neutral'),
};
// --- Organisation ------------------------------------------------------------
export const ORGANIZATION_TYPE = {
    NATIONAL: described('Direction générale', 'brand'),
    REGION: described('Zone regionale', 'info'),
    AGENCY: described('Agence / PDC', 'neutral'),
    STATION: described("Station d'intervention", 'warning'),
    ENTERPRISE: described('Institution', 'neutral'),
};
export const STATION_TYPE = {
    FIRE: described('Incendie', 'critical'),
    MEDICAL: described('Médicale', 'danger'),
    INTRUSION: described('Intrusion', 'warning'),
    MIXED: described('Mixte', 'brand'),
};
export const ORGANIZATION_STATUS = {
    ACTIVE: described('Active', 'success'),
    SUSPENDED: described('Suspendue', 'danger'),
    ARCHIVED: described('Archivée', 'neutral'),
};
// --- Utilisateurs ------------------------------------------------------------
export const ROLE = {
    SUPER_ADMIN: described('Super administrateur', 'critical'),
    NATIONAL_DIRECTOR: described('Direction générale', 'brand'),
    TECHNICAL_DIRECTOR: described('Direction technique', 'brand'),
    PLATFORM_MANAGER: described('Responsable plateforme', 'info'),
    DAF: described('Direction financiere', 'info'),
    ACCOUNTANT: described('Comptabilité', 'neutral'),
    QUALITY_DIRECTOR: described('Controle qualité', 'info'),
    REGION_MANAGER: described('Chef de zone', 'info'),
    AGENCY_MANAGER: described("Chef d'agence", 'neutral'),
    TECHNICIAN: described('Technicien', 'neutral'),
    OPERATOR: described('Opérateur ZMC', 'brand'),
    SUPERVISOR: described('Superviseur ZMC', 'brand'),
    STATION_AGENT: described("Agent de station", 'warning'),
    FIELD_AGENT: described('Agent terrain', 'warning'),
    HEALTH_STAFF: described('Personnel de santé', 'danger'),
    CLIENT_ADMIN: described('Administrateur client', 'neutral'),
    CLIENT: described('Client', 'neutral'),
};
export const USER_STATUS = {
    PENDING: described('Première connexion', 'warning'),
    ACTIVE: described('Actif', 'success'),
    SUSPENDED: described('Suspendu', 'danger'),
    DISABLED: described('Désactivé', 'neutral'),
};
export const LANGUAGE = {
    fr: 'Français',
    en: 'Anglais',
    sw: 'Swahili',
    ln: 'Lingala',
    lu: 'Tchiluba',
    kg: 'Kikongo',
};
export const AUDIT_ACTION = {
    LOGIN: described('Connexion', 'success'),
    LOGIN_FAILED: described('Échec de connexion', 'danger'),
    LOGOUT: described('Déconnexion', 'neutral'),
    TOKEN_REFRESH: described('Rafraîchissement de session', 'neutral'),
    PASSWORD_CHANGED: described('Mot de passe modifié', 'info'),
    PASSWORD_RESET: described('Mot de passe réinitialisé', 'warning'),
    TWO_FACTOR_ENABLED: described('2FA activée', 'success'),
    TWO_FACTOR_DISABLED: described('2FA désactivée', 'warning'),
    CREATE: described('Création', 'success'),
    UPDATE: described('Modification', 'info'),
    DELETE: described('Suppression', 'danger'),
    STATUS_CHANGE: described('Changement de statut', 'info'),
    DEVICE_ARM: described('Armement dispositif', 'brand'),
    DEVICE_DISARM: described('Desarmement dispositif', 'neutral'),
    CLIENT_MUTATION: described('Mutation client', 'warning'),
    SUBSCRIPTION_ACTIVATED: described('Abonnement active', 'success'),
    PERMISSION_DENIED: described('Accès refusé', 'danger'),
};
/** Recupere une description en evitant les accès non definis. */
export const describe = (map, key) => {
    if (key === null || key === undefined)
        return described('Inconnu', 'neutral');
    const normalized = String(key);
    return map[normalized] ?? described(normalized, 'neutral');
};
