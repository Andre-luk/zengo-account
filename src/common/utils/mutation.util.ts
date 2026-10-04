import {
  IntegrationHorizon,
  IntegrationOutcome,
  MutationStatus,
} from '@common/enums/mutation.enum';

/**
 * Regles metier pures de la mutation geographique.
 *
 * Aucune dependance a TypeORM ou Nest : le workflow (qui valide quoi, quand),
 * les echeances de suivi et le resume du transfert sont testables directement.
 */

/** Transitions autorisees entre statuts de demande. */
export const MUTATION_TRANSITIONS: Record<MutationStatus, MutationStatus[]> = {
  [MutationStatus.REQUESTED]: [
    MutationStatus.IN_REVIEW,
    MutationStatus.APPROVED,
    MutationStatus.REJECTED,
    MutationStatus.CANCELLED,
  ],
  [MutationStatus.IN_REVIEW]: [
    MutationStatus.APPROVED,
    MutationStatus.REJECTED,
    MutationStatus.CANCELLED,
  ],
  [MutationStatus.APPROVED]: [MutationStatus.APPLIED, MutationStatus.CANCELLED],
  [MutationStatus.REJECTED]: [],
  [MutationStatus.APPLIED]: [MutationStatus.REVERTED],
  [MutationStatus.REVERTED]: [],
  [MutationStatus.CANCELLED]: [],
};

export const TERMINAL_MUTATION_STATUSES: MutationStatus[] = [
  MutationStatus.REJECTED,
  MutationStatus.REVERTED,
  MutationStatus.CANCELLED,
];

/** Statuts pour lesquels une demande est encore en cours d'instruction. */
export const OPEN_MUTATION_STATUSES: MutationStatus[] = [
  MutationStatus.REQUESTED,
  MutationStatus.IN_REVIEW,
  MutationStatus.APPROVED,
];

export const isTerminalMutationStatus = (status: MutationStatus): boolean =>
  TERMINAL_MUTATION_STATUSES.includes(status);

export const isOpenMutationStatus = (status: MutationStatus): boolean =>
  OPEN_MUTATION_STATUSES.includes(status);

export const canTransitionMutation = (from: MutationStatus, to: MutationStatus): boolean =>
  MUTATION_TRANSITIONS[from].includes(to);

export const nextStatusesFor = (status: MutationStatus): MutationStatus[] =>
  MUTATION_TRANSITIONS[status];

/** Reference lisible d'une demande, ex. `MU-20261004-0003`. */
export const buildMutationReference = (date: Date, sequence: number): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `MU-${year}${month}${day}-${String(sequence).padStart(4, '0')}`;
};

// ---------------------------------------------------------------------------
// Double validation
// ---------------------------------------------------------------------------

export interface ValidatorIdentity {
  userId: string;
  labels: string[];
}

export interface ValidationDecision {
  allowed: boolean;
  reason?: 'SAME_ACTOR' | 'MISSING_QUALITY_ROLE' | 'ALREADY_DECIDED' | 'NOT_APPROVABLE';
}

/**
 * Controle de la double validation : l'agent qui demande ne peut pas valider sa
 * propre demande, et la validation doit venir d'un profil qualite (Directeur
 * controle qualite, direction nationale ou administration de la plateforme).
 *
 * Regrouper les deux rôles sur une meme personne est volontairement impossible :
 * c'est ce qui protege le client d'un transfert de portefeuille arbitraire.
 */
export const canValidateMutation = (input: {
  requester: ValidatorIdentity;
  validator: ValidatorIdentity;
  reviewerRoles: string[];
  status: MutationStatus;
}): ValidationDecision => {
  if (input.requester.userId === input.validator.userId) {
    return { allowed: false, reason: 'SAME_ACTOR' };
  }

  const allowed = input.validator.labels.some((label) => input.reviewerRoles.includes(label));
  if (!allowed) return { allowed: false, reason: 'MISSING_QUALITY_ROLE' };

  if (![MutationStatus.REQUESTED, MutationStatus.IN_REVIEW].includes(input.status)) {
    return { allowed: false, reason: 'ALREADY_DECIDED' };
  }

  return { allowed: true };
};

/** Application possible uniquement apres validation. */
export const canApplyMutation = (status: MutationStatus): boolean =>
  status === MutationStatus.APPROVED;

/** Retour a l'agence d'origine possible uniquement apres application. */
export const canRevertMutation = (status: MutationStatus): boolean =>
  status === MutationStatus.APPLIED;

// ---------------------------------------------------------------------------
// Impact du transfert
// ---------------------------------------------------------------------------

export interface TransferScope {
  fromOrganizationId: string;
  fromOrganizationName: string;
  fromRegionId: string | null;
  toOrganizationId: string;
  toOrganizationName: string;
  toRegionId: string | null;
}

export interface TransferImpact {
  /** La region change : les centres de secours ne sont plus les memes. */
  regionChanged: boolean;
  /** Les alertes ouvertes doivent etre redirigees vers la nouvelle region. */
  redirectOpenAlerts: boolean;
  /** Services a informer (journalisation et notification interne). */
  servicesToNotify: string[];
}

/**
 * Consequences d'un transfert de dossier.
 *
 * Un changement d'agence a l'interieur d'une meme region ne change pas les
 * centres de secours : seules les equipements et la facturation suivent. Un
 * changement de region impose de rediriger les alertes en cours vers les
 * stations de la nouvelle region.
 */
export const describeTransferImpact = (scope: TransferScope, openAlerts: number): TransferImpact => {
  const regionChanged =
    scope.fromRegionId !== null &&
    scope.toRegionId !== null &&
    scope.fromRegionId !== scope.toRegionId;

  const servicesToNotify = ['Qualite', 'Exploitation ZMC', 'Facturation'];
  if (regionChanged) servicesToNotify.push('Coordination regionale');
  // Les stations de secours ne changent qu'avec la region : dans une meme
  // region, le transfert n'a aucun effet sur les interventions en cours.
  if (regionChanged && openAlerts > 0) servicesToNotify.push('Stations de secours');

  return {
    regionChanged,
    redirectOpenAlerts: regionChanged && openAlerts > 0,
    servicesToNotify,
  };
};

export interface CaseLoadCounts {
  devices: number;
  subDevices: number;
  alertsLast30Days: number;
  openAlerts: number;
  openMissions: number;
  activeSubscriptions: number;
}

/** Resume chiffre du dossier transfere, repris dans l'historique et le rapport. */
export const summarizeCaseLoad = (counts: CaseLoadCounts): string => {
  const parts = [
    `${counts.devices} dispositif(s)`,
    `${counts.subDevices} sous-appareil(s)`,
    `${counts.alertsLast30Days} alerte(s) sur 30 jours`,
  ];
  if (counts.openAlerts > 0) parts.push(`${counts.openAlerts} alerte(s) en cours`);
  if (counts.openMissions > 0) parts.push(`${counts.openMissions} mission(s) engagee(s)`);
  if (counts.activeSubscriptions > 0) parts.push(`${counts.activeSubscriptions} abonnement(s) actif(s)`);

  return parts.join(' · ');
};

// ---------------------------------------------------------------------------
// Suivi de l'integration
// ---------------------------------------------------------------------------

/** Echeance d'un rapport d'integration, a compter de l'application du transfert. */
export const integrationDueAt = (appliedAt: Date, horizon: IntegrationHorizon): Date =>
  new Date(appliedAt.getTime() + horizon * 86_400_000);

/**
 * Horizons dont le rapport est attendu et non encore saisi.
 *
 * Un rapport en retard n'est pas une erreur : il alimente la liste de relance du
 * controle qualite, qui verifie que le client a bien ete pris en charge par sa
 * nouvelle agence.
 */
export const dueIntegrationReports = (
  appliedAt: Date | null,
  reported: Partial<Record<IntegrationHorizon, Date | null>>,
  now: Date = new Date(),
): IntegrationHorizon[] =>
  appliedAt === null
    ? []
    : [IntegrationHorizon.DAYS_7, IntegrationHorizon.DAYS_30].filter(
        (horizon) => !reported[horizon] && integrationDueAt(appliedAt, horizon) <= now,
      );

/** Un rapport est-il en retard au point de devenir un indicateur de risque ? */
export const isIntegrationReportLate = (
  appliedAt: Date | null,
  reported: Partial<Record<IntegrationHorizon, Date | null>>,
  now: Date = new Date(),
  graceDays = 5,
): boolean => {
  if (appliedAt === null) return false;

  return dueIntegrationReports(appliedAt, reported, now).some(
    (horizon) => now.getTime() - integrationDueAt(appliedAt, horizon).getTime() >= graceDays * 86_400_000,
  );
};

/** Libelle d'un rapport pour la console. */
export const describeIntegrationOutcome = (outcome: IntegrationOutcome | null): string => {
  switch (outcome) {
    case IntegrationOutcome.SATISFACTORY:
      return 'integration satisfaisante';
    case IntegrationOutcome.ISSUES_REPORTED:
      return 'difficultes signalees';
    case IntegrationOutcome.CLIENT_LOST:
      return 'client perdu';
    default:
      return 'rapport en attente';
  }
};
