import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AlertEventType, AlertType } from '@common/enums/alert.enum';
import { Language } from '@common/enums/client.enum';
import { SmsDirection, SmsMessageStatus, SmsTemplate } from '@common/enums/sms.enum';
import { Alert } from '@database/entities/alert.entity';
import { ClientProfile } from '@database/entities/client-profile.entity';
import { Intervention } from '@database/entities/intervention.entity';
import { SmsMessage } from '@database/entities/sms-message.entity';
import { AlertLifecycleService } from '@modules/alerts/alert-lifecycle.service';
import { countSmsSegments, renderSmsTemplate, SmsContext } from '@modules/telephony/sms-templates';
import { SMS_PROVIDER, SmsProvider } from '@modules/telephony/sms.provider';

/** Libelles francais des natures d'alerte, utilises dans les messages. */
const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  [AlertType.INTRUSION]: 'intrusion',
  [AlertType.FIRE]: 'incendie',
  [AlertType.MEDICAL]: 'urgence medicale',
  [AlertType.GAS_LEAK]: 'fuite de gaz',
  [AlertType.WATER_LEAK]: 'degat des eaux',
  [AlertType.PANIC]: 'bouton panique',
  [AlertType.SABOTAGE]: 'sabotage',
  [AlertType.SYSTEM]: 'alarme technique',
};

/**
 * Canal SMS transactionnel.
 *
 * Le cahier des charges demande que le client soit notifie « en parallele de
 * l'appel vocal » : le SMS part immediatement, sans attendre la reponse au
 * telephone, et sert de trace ecrite si le client ne decroche pas. Le service
 * ne prend jamais l'initiative d'agir sur le dossier : il informe, la decision
 * reste au superviseur (ou au rapport d'intervention).
 */
@Injectable()
export class AlertSmsService {
  private readonly logger = new Logger(AlertSmsService.name);

  constructor(
    @InjectRepository(SmsMessage)
    private readonly smsRepository: Repository<SmsMessage>,
    @InjectRepository(ClientProfile)
    private readonly clientRepository: Repository<ClientProfile>,
    @Inject(SMS_PROVIDER)
    private readonly smsProvider: SmsProvider,
    private readonly alertLifecycle: AlertLifecycleService,
    private readonly configService: ConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // Declencheurs metier
  // ---------------------------------------------------------------------------

  /** SMS « alerte detectee », envoye en parallele de l'appel vocal IA. */
  async notifyAlertRaised(alert: Alert): Promise<SmsMessage | null> {
    if (!this.configService.get<boolean>('app.sms.notifyOnAlert', true)) return null;

    return this.sendForAlert(alert, SmsTemplate.ALERT_RAISED, {
      time: formatLocalTime(alert.openedAt ?? new Date()),
      address: formatAlertAddress(alert),
    });
  }

  /** SMS « une equipe est en route », emis a l'affectation d'une mission. */
  async notifyMissionAssigned(intervention: Intervention, alert: Alert): Promise<SmsMessage | null> {
    if (!this.configService.get<boolean>('app.sms.notifyOnMission', true)) return null;

    return this.sendForAlert(
      alert,
      SmsTemplate.MISSION_ASSIGNED,
      {
        teamName: intervention.team?.name ?? 'Zengo',
        etaMinutes: intervention.etaMinutes ?? '-',
      },
      intervention.id,
    );
  }

  /** SMS « l'equipe est sur place », emis a l'arrivee sur site. */
  async notifyMissionOnSite(intervention: Intervention, alert: Alert): Promise<SmsMessage | null> {
    if (!this.configService.get<boolean>('app.sms.notifyOnMission', true)) return null;

    return this.sendForAlert(
      alert,
      SmsTemplate.MISSION_ON_SITE,
      { teamName: intervention.team?.name ?? 'Zengo' },
      intervention.id,
    );
  }

  /** SMS de cloture, emis lorsque le rapport d'intervention ferme le dossier. */
  async notifyAlertClosed(
    alert: Alert,
    outcome: string,
    intervention?: Intervention | null,
  ): Promise<SmsMessage | null> {
    if (!this.configService.get<boolean>('app.sms.notifyOnClosure', true)) return null;

    return this.sendForAlert(
      alert,
      SmsTemplate.ALERT_CLOSED,
      { outcome, teamName: intervention?.team?.name ?? undefined },
      intervention?.id ?? null,
    );
  }

  /**
   * Message libre redige depuis la console. Aucun modele n'est applique : le
   * corps fourni part tel quel, ce qui laisse le superviseur traduire a la main
   * s'il connait mieux la langue du client.
   */
  async sendCustom(alert: Alert | null, clientId: string | null, body: string): Promise<SmsMessage> {
    const client = clientId
      ? await this.clientRepository.findOne({ where: { id: clientId } })
      : alert?.clientId
        ? await this.clientRepository.findOne({ where: { id: alert.clientId } })
        : null;

    if (!client?.primaryPhone) {
      throw new NotFoundException('Aucun numero de telephone exploitable pour ce destinataire.');
    }

    return this.deliver({
      alertId: alert?.id ?? null,
      clientId: client.id,
      interventionId: null,
      template: SmsTemplate.CUSTOM,
      language: client.preferredLanguage ?? Language.FRENCH,
      toNumber: client.primaryPhone,
      body,
      context: {},
      attemptNumber: 1,
    });
  }

  // ---------------------------------------------------------------------------
  // Sequence d'envoi
  // ---------------------------------------------------------------------------

  /**
   * Rend le modele, enregistre le message en base *avant* l'appel au
   * fournisseur (un envoi qui echoue doit rester visible dans l'historique),
   * puis journalise le resultat dans la chronologie du dossier.
   */
  private async sendForAlert(
    alert: Alert,
    template: SmsTemplate,
    context: SmsContext,
    interventionId?: string | null,
  ): Promise<SmsMessage | null> {
    if (!this.configService.get<boolean>('app.sms.enabled', true)) {
      this.logger.debug(`Canal SMS desactive : ${template} non envoye pour ${alert.reference}.`);
      return null;
    }

    const client =
      alert.client ??
      (alert.clientId ? await this.clientRepository.findOne({ where: { id: alert.clientId } }) : null);

    if (!client?.primaryPhone) {
      this.logger.warn(`Alerte ${alert.reference} : aucun numero de telephone, SMS ${template} non envoye.`);
      return null;
    }

    const language = client.preferredLanguage ?? Language.FRENCH;
    const body = renderSmsTemplate(template, language, this.commonContext(alert, context));

    return this.deliver({
      alertId: alert.id,
      clientId: client.id,
      interventionId: interventionId ?? null,
      template,
      language,
      toNumber: client.primaryPhone,
      body,
      context,
      attemptNumber: 1,
    });
  }

  private async deliver(input: {
    alertId: string | null;
    clientId: string | null;
    interventionId: string | null;
    template: SmsTemplate;
    language: Language;
    toNumber: string;
    body: string;
    context: SmsContext;
    attemptNumber: number;
  }): Promise<SmsMessage> {
    const { segments, encoding } = countSmsSegments(input.body);

    let message = await this.smsRepository.save(
      this.smsRepository.create({
        alertId: input.alertId,
        clientId: input.clientId,
        interventionId: input.interventionId,
        direction: SmsDirection.OUTBOUND,
        template: input.template,
        language: input.language,
        provider: this.smsProvider.name,
        toNumber: input.toNumber,
        body: input.body,
        encoding,
        segments,
        status: SmsMessageStatus.QUEUED,
        attemptNumber: input.attemptNumber,
        queuedAt: new Date(),
        metadata: { context: input.context },
      }),
    );

    try {
      const sent = await this.smsProvider.send({
        toNumber: input.toNumber,
        body: input.body,
        reference: message.id,
        template: input.template,
        statusCallbackUrl: this.configService.get<string>('app.sms.statusCallbackUrl') || undefined,
      });

      message.providerMessageId = sent.providerMessageId;
      message.status = sent.status;
      message.fromNumber = sent.fromNumber ?? null;
      message.segments = sent.segments ?? segments;
      message.costUsd = sent.costUsd ?? null;
      message.sentAt = new Date();
      message.errorCode = null;
      message.errorMessage = null;
      message = await this.smsRepository.save(message);
    } catch (error) {
      message.status = SmsMessageStatus.FAILED;
      message.errorMessage = error instanceof Error ? error.message.slice(0, 512) : String(error);
      message = await this.smsRepository.save(message);
      this.logger.error(`Echec du SMS ${input.template} vers ${input.toNumber} : ${message.errorMessage}`);
    }

    if (input.alertId) {
      await this.alertLifecycle.recordEvent(input.alertId, AlertEventType.SMS_SENT, {
        message:
          message.status === SmsMessageStatus.FAILED
            ? `SMS non envoye vers ${input.toNumber} : ${message.errorMessage}`
            : `SMS ${input.template} envoye en ${message.language} vers ${input.toNumber} (${message.segments} segment(s)).`,
        data: {
          smsId: message.id,
          template: message.template,
          status: message.status,
          provider: message.provider,
        },
      });
    }

    return message;
  }

  /** Variables communes a tous les modeles (reference, nature, urgence). */
  private commonContext(alert: Alert, context: SmsContext): SmsContext {
    return {
      reference: alert.reference,
      alertType: ALERT_TYPE_LABELS[alert.type] ?? 'alerte',
      emergencyPhone: this.configService.get<string>('app.sms.emergencyPhone') ?? '',
      ...context,
    };
  }

  // ---------------------------------------------------------------------------
  // Exploitation (console et webhooks)
  // ---------------------------------------------------------------------------

  listByAlert(alertId: string): Promise<SmsMessage[]> {
    return this.smsRepository.find({ where: { alertId }, order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<SmsMessage> {
    const message = await this.smsRepository.findOne({ where: { id } });
    if (!message) throw new NotFoundException('Message SMS introuvable.');
    return message;
  }

  /** Renvoi manuel depuis la console : nouveau message, trace conservee. */
  async resend(id: string): Promise<SmsMessage> {
    const previous = await this.findOne(id);
    if (previous.direction !== SmsDirection.OUTBOUND) {
      throw new NotFoundException('Seul un message sortant peut etre renvoye.');
    }

    return this.deliver({
      alertId: previous.alertId,
      clientId: previous.clientId,
      interventionId: previous.interventionId,
      template: previous.template,
      language: previous.language,
      toNumber: previous.toNumber,
      body: previous.body,
      context: (previous.metadata?.context as SmsContext) ?? {},
      attemptNumber: previous.attemptNumber + 1,
    });
  }

  /**
   * Accuse de remise du fournisseur. Un message deja livre n'est jamais
   * degrade : les operateurs emettent parfois un `sent` apres un `delivered`.
   */
  async applyDeliveryReport(providerMessageId: string, event: {
    status: SmsMessageStatus;
    errorCode?: string | null;
    errorMessage?: string | null;
    costUsd?: string | null;
  }): Promise<SmsMessage | null> {
    const message = await this.smsRepository.findOne({ where: { providerMessageId } });
    if (!message) {
      this.logger.warn(`Accuse de remise pour un message inconnu (${providerMessageId}) : ignore.`);
      return null;
    }

    if (message.status === SmsMessageStatus.DELIVERED) return message;

    message.status = event.status;
    message.errorCode = event.errorCode ?? message.errorCode;
    message.errorMessage = event.errorMessage ?? message.errorMessage;
    message.costUsd = event.costUsd ?? message.costUsd;

    if (event.status === SmsMessageStatus.DELIVERED) message.deliveredAt = new Date();
    if (!message.sentAt && event.status !== SmsMessageStatus.FAILED) message.sentAt = new Date();

    return this.smsRepository.save(message);
  }

  /** Statistiques d'exploitation du canal, pour la supervision. */
  async stats(): Promise<{
    total: number;
    byStatus: { status: SmsMessageStatus; count: number }[];
    acceptanceRate: number | null;
    deliveryRate: number | null;
    segments: number;
  }> {
    const rows = await this.smsRepository
      .createQueryBuilder('sms')
      .select('sms.status', 'status')
      .addSelect('COUNT(*)::int', 'count')
      .addSelect('COALESCE(SUM(sms.segments), 0)::int', 'segments')
      .groupBy('sms.status')
      .getRawMany<{ status: SmsMessageStatus; count: number; segments: number }>();

    const countOf = (...statuses: SmsMessageStatus[]): number =>
      rows
        .filter((row) => statuses.includes(row.status))
        .reduce((sum, row) => sum + Number(row.count), 0);

    const total = rows.reduce((sum, row) => sum + Number(row.count), 0);
    // Un message est « accepte » des que le fournisseur l'a pris en charge ; il
    // n'est « remis » que lorsque l'operateur confirme la livraison.
    const accepted = countOf(SmsMessageStatus.SENT, SmsMessageStatus.DELIVERED);
    const resolved = countOf(
      SmsMessageStatus.DELIVERED,
      SmsMessageStatus.FAILED,
      SmsMessageStatus.UNDELIVERED,
    );

    return {
      total,
      byStatus: rows.map((row) => ({ status: row.status, count: Number(row.count) })),
      acceptanceRate: total === 0 ? null : Math.round((accepted / total) * 1000) / 10,
      deliveryRate:
        resolved === 0 ? null : Math.round((countOf(SmsMessageStatus.DELIVERED) / resolved) * 1000) / 10,
      segments: rows.reduce((sum, row) => sum + Number(row.segments), 0),
    };
  }
}

/** Heure locale (fuseau du serveur) au format court `19:42`. */
const formatLocalTime = (date: Date): string => {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

/** Adresse du lieu, formatee pour s'inserer dans une phrase (« a 19:42, ... »). */
const formatAlertAddress = (alert: Alert): string => {
  const parts = [alert.address, alert.city ?? alert.organization?.city].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length === 0 ? '' : `, ${parts.join(', ')}`;
};
