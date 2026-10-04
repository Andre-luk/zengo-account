import {
  IntegrationHorizon,
  IntegrationOutcome,
  MutationStatus,
  MutationType,
} from '@common/enums/mutation.enum';
import {
  buildMutationReference,
  canApplyMutation,
  canRevertMutation,
  canTransitionMutation,
  canValidateMutation,
  describeIntegrationOutcome,
  describeTransferImpact,
  dueIntegrationReports,
  integrationDueAt,
  isIntegrationReportLate,
  isOpenMutationStatus,
  isTerminalMutationStatus,
  nextStatusesFor,
  summarizeCaseLoad,
} from '@common/utils/mutation.util';

describe('Mutation geographique : regles metier', () => {
  describe('Cycle de vie', () => {
    it('suit le parcours demande -> validation -> application', () => {
      expect(canTransitionMutation(MutationStatus.REQUESTED, MutationStatus.APPROVED)).toBe(true);
      expect(canTransitionMutation(MutationStatus.APPROVED, MutationStatus.APPLIED)).toBe(true);
      expect(canTransitionMutation(MutationStatus.APPLIED, MutationStatus.REVERTED)).toBe(true);
    });

    it('interdit de sauter la validation qualite', () => {
      expect(canTransitionMutation(MutationStatus.REQUESTED, MutationStatus.APPLIED)).toBe(false);
      expect(canTransitionMutation(MutationStatus.REJECTED, MutationStatus.APPLIED)).toBe(false);
      expect(canTransitionMutation(MutationStatus.CANCELLED, MutationStatus.APPROVED)).toBe(false);
    });

    it('interdit de revenir en arriere sur une decision', () => {
      expect(canTransitionMutation(MutationStatus.REJECTED, MutationStatus.APPROVED)).toBe(false);
      expect(canTransitionMutation(MutationStatus.REVERTED, MutationStatus.APPLIED)).toBe(false);
      expect(nextStatusesFor(MutationStatus.REJECTED)).toEqual([]);
    });

    it('distingue les demandes ouvertes des statuts terminaux', () => {
      expect(isOpenMutationStatus(MutationStatus.REQUESTED)).toBe(true);
      expect(isOpenMutationStatus(MutationStatus.APPROVED)).toBe(true);
      expect(isOpenMutationStatus(MutationStatus.APPLIED)).toBe(false);
      expect(isTerminalMutationStatus(MutationStatus.REJECTED)).toBe(true);
      expect(isTerminalMutationStatus(MutationStatus.APPLIED)).toBe(false);
    });

    it('n applique et ne retourne que dans le bon statut', () => {
      expect(canApplyMutation(MutationStatus.APPROVED)).toBe(true);
      expect(canApplyMutation(MutationStatus.REQUESTED)).toBe(false);
      expect(canRevertMutation(MutationStatus.APPLIED)).toBe(true);
      expect(canRevertMutation(MutationStatus.APPROVED)).toBe(false);
    });

    it('construit une reference lisible', () => {
      expect(buildMutationReference(new Date(2026, 9, 4), 7)).toBe('MU-20261004-0007');
    });
  });

  describe('Double validation', () => {
    const reviewerRoles = ['QUALITY_DIRECTOR', 'NATIONAL_DIRECTOR', 'SUPER_ADMIN'];
    const requester = { userId: 'agent-1', labels: ['AGENCY_MANAGER'] };

    it('accepte la validation par un profil qualite distinct', () => {
      expect(
        canValidateMutation({
          requester,
          validator: { userId: 'qualite-1', labels: ['QUALITY_DIRECTOR'] },
          reviewerRoles,
          status: MutationStatus.REQUESTED,
        }).allowed,
      ).toBe(true);
    });

    it('refuse que le demandeur valide sa propre demande', () => {
      const decision = canValidateMutation({
        requester,
        validator: { userId: 'agent-1', labels: ['AGENCY_MANAGER', 'QUALITY_DIRECTOR'] },
        reviewerRoles,
        status: MutationStatus.REQUESTED,
      });
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe('SAME_ACTOR');
    });

    it('refuse un profil sans habilite qualite', () => {
      const decision = canValidateMutation({
        requester,
        validator: { userId: 'agent-2', labels: ['AGENCY_MANAGER'] },
        reviewerRoles,
        status: MutationStatus.REQUESTED,
      });
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe('MISSING_QUALITY_ROLE');
    });

    it('refuse de re-decider une demande deja instruite', () => {
      const decision = canValidateMutation({
        requester,
        validator: { userId: 'qualite-1', labels: ['QUALITY_DIRECTOR'] },
        reviewerRoles,
        status: MutationStatus.APPROVED,
      });
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe('ALREADY_DECIDED');
    });
  });

  describe('Impact du transfert', () => {
    const base = {
      fromOrganizationId: 'agence-lub',
      fromOrganizationName: 'Agence Lubumbashi Centre',
      toOrganizationId: 'agence-kin',
      toOrganizationName: 'Agence Kinshasa Gombe',
    };

    it('impose la redirection des alertes lors d un changement de region', () => {
      const impact = describeTransferImpact(
        { ...base, fromRegionId: 'region-haut-katanga', toRegionId: 'region-kinshasa' },
        2,
      );

      expect(impact.regionChanged).toBe(true);
      expect(impact.redirectOpenAlerts).toBe(true);
      expect(impact.servicesToNotify).toContain('Coordination regionale');
      expect(impact.servicesToNotify).toContain('Stations de secours');
    });

    it('ne redirige rien dans la meme region, mais informe les services', () => {
      const impact = describeTransferImpact(
        { ...base, fromRegionId: 'region-kinshasa', toRegionId: 'region-kinshasa' },
        2,
      );

      expect(impact.regionChanged).toBe(false);
      expect(impact.redirectOpenAlerts).toBe(false);
      expect(impact.servicesToNotify).toEqual(['Qualite', 'Exploitation ZMC', 'Facturation']);
    });

    it('n exige pas de relais de station sans alerte en cours', () => {
      const impact = describeTransferImpact(
        { ...base, fromRegionId: 'region-haut-katanga', toRegionId: 'region-kinshasa' },
        0,
      );

      expect(impact.redirectOpenAlerts).toBe(false);
      expect(impact.servicesToNotify).not.toContain('Stations de secours');
    });

    it('reste prudent lorsque les regions ne sont pas connues', () => {
      const impact = describeTransferImpact({ ...base, fromRegionId: null, toRegionId: null }, 1);
      expect(impact.regionChanged).toBe(false);
    });
  });

  describe('Resume du dossier transfere', () => {
    it('resume la charge reprise par la nouvelle agence', () => {
      expect(
        summarizeCaseLoad({
          devices: 1,
          subDevices: 6,
          alertsLast30Days: 3,
          openAlerts: 1,
          openMissions: 0,
          activeSubscriptions: 1,
        }),
      ).toBe('1 dispositif(s) · 6 sous-appareil(s) · 3 alerte(s) sur 30 jours · 1 alerte(s) en cours · 1 abonnement(s) actif(s)');
    });

    it('n affiche pas les elements absents', () => {
      expect(
        summarizeCaseLoad({
          devices: 1,
          subDevices: 0,
          alertsLast30Days: 0,
          openAlerts: 0,
          openMissions: 0,
          activeSubscriptions: 0,
        }),
      ).toBe('1 dispositif(s) · 0 sous-appareil(s) · 0 alerte(s) sur 30 jours');
    });
  });

  describe('Suivi de l integration', () => {
    const appliedAt = new Date('2026-10-04T08:00:00Z');

    it('echelonne les rapports a 7 et 30 jours', () => {
      expect(integrationDueAt(appliedAt, IntegrationHorizon.DAYS_7).toISOString()).toBe('2026-10-11T08:00:00.000Z');
      expect(integrationDueAt(appliedAt, IntegrationHorizon.DAYS_30).toISOString()).toBe('2026-11-03T08:00:00.000Z');
    });

    it('ne reclame rien avant l echeance', () => {
      expect(dueIntegrationReports(appliedAt, {}, new Date('2026-10-06T08:00:00Z'))).toEqual([]);
    });

    it('reclame le rapport a 7 jours puis celui a 30 jours', () => {
      expect(dueIntegrationReports(appliedAt, {}, new Date('2026-10-12T08:00:00Z'))).toEqual([
        IntegrationHorizon.DAYS_7,
      ]);
      expect(dueIntegrationReports(appliedAt, {}, new Date('2026-11-05T08:00:00Z'))).toEqual([
        IntegrationHorizon.DAYS_7,
        IntegrationHorizon.DAYS_30,
      ]);
    });

    it('ne reclame plus un rapport deja saisi', () => {
      expect(
        dueIntegrationReports(
          appliedAt,
          { [IntegrationHorizon.DAYS_7]: new Date('2026-10-11T09:00:00Z') },
          new Date('2026-11-05T08:00:00Z'),
        ),
      ).toEqual([IntegrationHorizon.DAYS_30]);
    });

    it('ne reclame rien pour une mutation jamais appliquee', () => {
      expect(dueIntegrationReports(null, {}, new Date('2027-01-01T00:00:00Z'))).toEqual([]);
    });

    it('alerte lorsque le rapport est en retard au-dela du delai de grace', () => {
      expect(isIntegrationReportLate(appliedAt, {}, new Date('2026-10-15T08:00:00Z'))).toBe(false);
      expect(isIntegrationReportLate(appliedAt, {}, new Date('2026-10-17T08:00:00Z'))).toBe(true);
      expect(
        isIntegrationReportLate(
          appliedAt,
          { [IntegrationHorizon.DAYS_7]: new Date('2026-10-11T08:00:00Z') },
          new Date('2026-10-17T08:00:00Z'),
        ),
      ).toBe(false);
    });

    it('traduit la conclusion du rapport', () => {
      expect(describeIntegrationOutcome(IntegrationOutcome.SATISFACTORY)).toBe('integration satisfaisante');
      expect(describeIntegrationOutcome(IntegrationOutcome.CLIENT_LOST)).toBe('client perdu');
      expect(describeIntegrationOutcome(null)).toBe('rapport en attente');
    });
  });

  describe('Types de mouvement', () => {
    it('distingue le transfert du retour a l agence d origine', () => {
      expect(MutationType.TRANSFER).toBe('TRANSFER');
      expect(MutationType.RETURN).toBe('RETURN');
    });
  });
});
