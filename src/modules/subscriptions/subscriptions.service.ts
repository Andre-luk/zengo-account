import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, LessThanOrEqual, Not, Repository } from 'typeorm';
import { ClientStatus, Currency, SubscriptionStatus } from '@common/enums/client.enum';
import { Role } from '@common/enums/role.enum';
import {
  PAYMENT_CHANNEL_BY_METHOD,
  PaymentMethod,
  PaymentStatus,
  SubscriptionCodeStatus,
  SubscriptionDuration,
} from '@common/enums/subscription.enum';
import { SmsTemplate } from '@common/enums/sms.enum';
import { AuthenticatedUser } from '@common/interfaces/authenticated-user.interface';
import {
  buildSubscriptionCode,
  computeSubscriptionPrice,
  computeValidityWindow,
  daysRemaining,
  deriveSubscriptionStatus,
  describeValidity,
  isSupportedDuration,
  normalizeSubscriptionCode,
  shouldRestrictAccess,
  toCdf,
} from '@common/utils/subscription.util';
import { ClientProfile } from '@database/entities/client-profile.entity';
import { Payment } from '@database/entities/payment.entity';
import { Subscription } from '@database/entities/subscription.entity';
import { TariffGroup } from '@database/entities/tariff-group.entity';
import { AlertSmsService } from '@modules/alerts/alert-sms.service';
import { OrganizationScopeService } from '@modules/organizations/organizations.service';
import { PaymentNotification } from '@modules/subscriptions/providers/mobile-money.provider';
import { buildPaginatedResult, PaginatedResult } from '@common/dto/pagination.dto';
import {
  ActivateSubscriptionDto,
  QuerySubscriptionsDto,
  SubscriptionPaymentDto,
} from '@modules/subscriptions/dto/subscription.dto';

export interface SubscriptionView {
  id: string;
  code: string;
  status: SubscriptionCodeStatus;
  effectiveStatus: SubscriptionStatus;
  durationDays: SubscriptionDuration;
  startsAt: Date;
  endsAt: Date;
  daysRemaining: number;
  validity: string;
  priceUsd: string;
  priceCdf: string | null;
  currency: Currency;
  discountUsd: string;
  isFirstSubscription: boolean;
  activatedAt: Date | null;
  issuedAt: Date;
  issuedByLabel: string | null;
  notes: string | null;
  /** Fiche du porteur du code, lorsque la relation a ete chargee. */
  client: { id: string; zengoId: string | null; fullName: string; primaryPhone: string } | null;
}

export interface IssueResult {
  subscription: SubscriptionView;
  payment: Payment | null;
  client: ClientProfile;
  smsSent: boolean;
  smsError: string | null;
}

/**
 * Abonnements et encaissements.
 *
 * Le parcours commercial du cahier des charges : un paiement est encaisse (au
 * guichet de l'agence ou via Mobile Money), la plateforme emet un code unique
 * `ZG-XXXX-XXXX`, l'etend au client par SMS, et le client active ce code depuis
 * l'application ou depuis un ecran central. Un renouvellement anticipe ne fait
 * jamais perdre les jours restants.
 */
@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(ClientProfile)
    private readonly clientRepository: Repository<ClientProfile>,
    @InjectRepository(TariffGroup)
    private readonly tariffRepository: Repository<TariffGroup>,
    private readonly scopeService: OrganizationScopeService,
    private readonly alertSms: AlertSmsService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  // ---------------------------------------------------------------------------
  // Webhooks Mobile Money et reconciliation
  // ---------------------------------------------------------------------------

  /**
   * Traite un accuse de paiement Mobile Money.
   *
   * Trois cas, dans l'ordre :
   *  1. l'operateur confirme une demande de paiement deja connue (`PENDING`) →
   *     le paiement est confirme, l'abonnement emis et le code envoye ;
   *  2. aucune demande correspondante : le paiement est enregistre en attente et
   *     `needsReconciliation` vaut `true`, le caissier le rattachera au client ;
   *  3. l'operateur refuse le mouvement : dans les deux cas la ligne garde la
   *     trace de l'echec, pour que la caisse puisse justifier le non-encaissement.
   */
  async handleMobileMoneyNotification(notification: PaymentNotification): Promise<{
    outcome: 'CONFIRMED' | 'PENDING' | 'FAILED' | 'DUPLICATE';
    paymentId: string | null;
    subscriptionCode: string | null;
    needsReconciliation: boolean;
    message: string;
  }> {
    if (!notification.success) {
      const matched = await this.matchClientForNotification(notification);
      const failed = await this.paymentRepository.save(
        this.paymentRepository.create({
          clientId: matched?.id ?? null,
          method: notification.method,
          channel: PAYMENT_CHANNEL_BY_METHOD[notification.method],
          amountUsd: notification.currency === 'USD' ? notification.amount.toFixed(2) : '0.00',
          amountCdf: notification.currency === 'CDF' ? notification.amount.toFixed(2) : null,
          payerMsisdn: notification.payerMsisdn,
          operatorReference: notification.transactionId,
          status: PaymentStatus.FAILED,
          failureReason: notification.failureReason?.slice(0, 255) ?? 'paiement refuse',
          notes: `Notification ${notification.operator} : ${notification.failureReason ?? 'refus'}`,
          metadata: { notification: notification.raw },
        }),
      );

      return {
        outcome: 'FAILED',
        paymentId: failed.id,
        subscriptionCode: null,
        needsReconciliation: false,
        message: notification.failureReason ?? 'paiement refuse par l operateur',
      };
    }

    const existing = await this.paymentRepository.findOne({
      where: { operatorReference: notification.transactionId },
    });
    if (existing) {
      return {
        outcome: 'DUPLICATE',
        paymentId: existing.id,
        subscriptionCode: null,
        needsReconciliation: false,
        message: 'Cette transaction a deja ete enregistree.',
      };
    }

    const client = await this.matchClientForNotification(notification);

    // Sans client identifiable, la ligne attend le rapprochement du caissier :
    // on n'invente jamais un porteur a partir d'un numero inconnu.
    if (!client) {
      const orphan = await this.paymentRepository.save(
        this.paymentRepository.create({
          clientId: null,
          method: notification.method,
          channel: PAYMENT_CHANNEL_BY_METHOD[notification.method],
          amountUsd: notification.currency === 'USD' ? notification.amount.toFixed(2) : '0.00',
          amountCdf: notification.currency === 'CDF' ? notification.amount.toFixed(2) : null,
          payerMsisdn: notification.payerMsisdn,
          operatorReference: notification.transactionId,
          status: PaymentStatus.PENDING,
          notes: `A rapprocher : aucun client ne correspond a ${notification.payerMsisdn ?? 'numero inconnu'}.`,
          metadata: { notification: notification.raw, reference: notification.reference },
        }),
      );

      this.logger.warn(
        `Paiement ${notification.operator} ${notification.transactionId} en attente de rapprochement (${notification.amount} ${notification.currency}).`,
      );

      return {
        outcome: 'PENDING',
        paymentId: orphan.id,
        subscriptionCode: null,
        needsReconciliation: true,
        message: 'Compte client non identifie : paiement a rapprocher manuellement.',
      };
    }

    return this.settleMobileMoneyPayment(client, notification);
  }

  /**
   * Rapproche un paiement Mobile Money en attente a un client, puis encaisse
   * l'abonnement correspondant. C'est l'action du caissier lorsque le numero
   * payeur ne permet pas d'identifier le dossier automatiquement.
   */
  async reconcilePayment(
    actor: AuthenticatedUser,
    paymentId: string,
    input: { clientId: string; durationDays: SubscriptionDuration; note?: string },
  ): Promise<IssueResult> {
    const payment = await this.paymentRepository.findOne({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Paiement introuvable.');
    if (payment.status === PaymentStatus.CONFIRMED) {
      throw new ConflictException('Ce paiement est deja encaisse.');
    }
    if (payment.status === PaymentStatus.REFUNDED) {
      throw new BadRequestException('Ce paiement a ete rembourse : il ne peut plus etre encaisse.');
    }

    const client = await this.loadClientOrFail(input.clientId);
    await this.assertInScope(actor, client.organizationId);

    const exchangeRate = payment.exchangeRate ? Number(payment.exchangeRate) : this.defaultExchangeRate();
    const isFirstSubscription = (await this.countSubscriptions(client.id)) === 0;
    const window = computeValidityWindow(input.durationDays, {
      paidAt: payment.paidAt ?? new Date(),
      currentEndsAt: client.subscriptionExpiresAt,
    });

    const amountUsd = Number(payment.amountUsd) > 0 ? Number(payment.amountUsd) : 0;
    const amountCdf = payment.amountCdf ? Number(payment.amountCdf) : null;

    const result = await this.dataSource.transaction(async (manager) => {
      const subscription = manager.create(Subscription, {
        clientId: client.id,
        code: await this.generateUniqueCode(manager),
        durationDays: input.durationDays,
        status: SubscriptionCodeStatus.ISSUED,
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        priceUsd: (amountUsd > 0 ? amountUsd : this.defaultMonthlyFee()).toFixed(2),
        priceCdf: amountCdf === null ? null : amountCdf.toFixed(2),
        exchangeRate: exchangeRate.toFixed(4),
        discountUsd: '0.00',
        tariffGroupId: client.tariffGroupId,
        isFirstSubscription,
        issuedById: actor.id,
        issuedByLabel: `${actor.firstName} ${actor.lastName}`.trim(),
        issuedAt: new Date(),
        notes: input.note ?? `Rapprochement du paiement ${payment.operatorReference ?? payment.id}`,
        metadata: { reconciledPaymentId: payment.id, method: payment.method },
      });
      const saved = await manager.save(subscription);

      await manager.update(
        Payment,
        payment.id,
        {
          clientId: client.id,
          subscriptionId: saved.id,
          status: PaymentStatus.CONFIRMED,
          confirmedAt: new Date(),
          organizationId: client.organizationId,
          recordedById: actor.id,
          recordedByLabel: `${actor.firstName} ${actor.lastName}`.trim(),
          notes: input.note ?? payment.notes,
        },
      );

      await manager.update(ClientProfile, client.id, {
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionExpiresAt: window.endsAt,
        status: client.status === ClientStatus.PENDING ? ClientStatus.ACTIVE : client.status,
      });

      const refreshed = await manager.findOneOrFail(ClientProfile, { where: { id: client.id } });
      const sms = await this.sendCode(refreshed, saved);

      this.logger.log(
        `Paiement ${payment.operatorReference ?? payment.id} rapproche de ${refreshed.zengoId ?? refreshed.id} : code ${saved.code}.`,
      );

      return { subscription: saved, client: refreshed, smsSent: sms.sent, smsError: sms.error };
    });

    return {
      subscription: this.toView(result.subscription),
      payment: (await this.paymentRepository.findOne({ where: { id: payment.id } })) ?? payment,
      client: result.client,
      smsSent: result.smsSent,
      smsError: result.smsError,
    };
  }

  /** Journal des encaissements, filtrable (moyen, statut, periode). */
  async listPayments(
    actor: AuthenticatedUser,
    query: { page?: number; limit?: number; status?: PaymentStatus; method?: PaymentMethod; days?: number },
  ): Promise<PaginatedResult<Payment>> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 20;

    const builder = this.paymentRepository
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.client', 'client')
      .leftJoinAndSelect('payment.organization', 'organization');

    const scope = await this.scopeService.getAccessibleOrganizationIds(actor);
    if (scope !== null) {
      if (scope.length === 0) return buildPaginatedResult<Payment>([], 0, page, limit);
      builder.andWhere('(payment.organizationId IN (:...scope) OR payment.organizationId IS NULL)', { scope });
    }

    if (query.status) builder.andWhere('payment.status = :status', { status: query.status });
    if (query.method) builder.andWhere('payment.method = :method', { method: query.method });
    if (query.days && query.days > 0) {
      builder.andWhere('payment.createdAt >= :since', { since: new Date(Date.now() - query.days * 86_400_000) });
    }

    builder.orderBy('payment.createdAt', 'DESC').skip((page - 1) * limit).take(limit);
    const [items, total] = await builder.getManyAndCount();
    return buildPaginatedResult(items, total, page, limit);
  }

  /**
   * Rapprochement : totaux par operateur et par jour, face au nombre de
   * paiements confirmes et en attente. C'est le controle que fait la caisse en
   * fin de journee avec les releves des operateurs.
   */
  async reconciliation(
    actor: AuthenticatedUser,
    options: { days?: number } = {},
  ): Promise<{
    windowDays: number;
    byOperator: { method: PaymentMethod; channel: string; count: number; amountUsd: number; amountCdf: number }[];
    pending: { count: number; amountUsd: number; amountCdf: number; items: Payment[] };
    confirmed: { count: number; amountUsd: number; amountCdf: number };
    byDay: { day: string; count: number; amountUsd: number; amountCdf: number }[];
  }> {
    const days = options.days && options.days > 0 ? Math.min(options.days, 90) : 30;
    const since = new Date(Date.now() - days * 86_400_000);
    const scope = await this.scopeService.getAccessibleOrganizationIds(actor);

    const base = this.paymentRepository.createQueryBuilder('payment').where('payment.createdAt >= :since', { since });
    if (scope !== null) {
      if (scope.length === 0) {
        return emptyReconciliation(days);
      }
      base.andWhere('(payment.organizationId IN (:...scope) OR payment.organizationId IS NULL)', { scope });
    }

    const byOperator = await base
      .clone()
      .select('payment.method', 'method')
      .addSelect('payment.channel', 'channel')
      .addSelect('COUNT(*)::int', 'count')
      .addSelect('COALESCE(SUM(payment.amountUsd), 0)::float', 'amount_usd')
      .addSelect('COALESCE(SUM(payment.amountCdf), 0)::float', 'amount_cdf')
      .groupBy('payment.method')
      .addGroupBy('payment.channel')
      .getRawMany<{ method: PaymentMethod; channel: string; count: number; amount_usd: number; amount_cdf: number }>();

    const [confirmed] = await base
      .clone()
      .select('COUNT(*)::int', 'count')
      .addSelect('COALESCE(SUM(payment.amountUsd), 0)::float', 'amount_usd')
      .addSelect('COALESCE(SUM(payment.amountCdf), 0)::float', 'amount_cdf')
      .andWhere('payment.status = :confirmed', { confirmed: PaymentStatus.CONFIRMED })
      .getRawMany<{ count: number; amount_usd: number; amount_cdf: number }>();

    const pendingRows = await base
      .clone()
      .leftJoinAndSelect('payment.client', 'client')
      .andWhere('payment.status = :pending', { pending: PaymentStatus.PENDING })
      .orderBy('payment.createdAt', 'DESC')
      .take(50)
      .getMany();

    const byDay = await base
      .clone()
      .select("TO_CHAR(payment.createdAt, 'YYYY-MM-DD')", 'day')
      .addSelect('COUNT(*)::int', 'count')
      .addSelect('COALESCE(SUM(payment.amountUsd), 0)::float', 'amount_usd')
      .addSelect('COALESCE(SUM(payment.amountCdf), 0)::float', 'amount_cdf')
      .groupBy("TO_CHAR(payment.createdAt, 'YYYY-MM-DD')")
      .orderBy('day', 'DESC')
      .getRawMany<{ day: string; count: number; amount_usd: number; amount_cdf: number }>();

    return {
      windowDays: days,
      byOperator: byOperator.map((row) => ({
        method: row.method,
        channel: row.channel,
        count: Number(row.count),
        amountUsd: round2(Number(row.amount_usd)),
        amountCdf: round2(Number(row.amount_cdf)),
      })),
      pending: {
        count: pendingRows.length,
        amountUsd: round2(pendingRows.reduce((sum, row) => sum + Number(row.amountUsd), 0)),
        amountCdf: round2(pendingRows.reduce((sum, row) => sum + Number(row.amountCdf ?? 0), 0)),
        items: pendingRows,
      },
      confirmed: {
        count: Number(confirmed?.count ?? 0),
        amountUsd: round2(Number(confirmed?.amount_usd ?? 0)),
        amountCdf: round2(Number(confirmed?.amount_cdf ?? 0)),
      },
      byDay: byDay.map((row) => ({
        day: row.day,
        count: Number(row.count),
        amountUsd: round2(Number(row.amount_usd)),
        amountCdf: round2(Number(row.amount_cdf)),
      })),
    };
  }

  /**
   * Confirmation d'un paiement Mobile Money : le client est reconnu par son
   * numero, sa reference de contrat, ou le code qu'il a rappele. On cherche
   * d'abord une demande de paiement en attente pour ce numero ; sinon on
   * rapproche du porteur du numero principal.
   */
  private async settleMobileMoneyPayment(
    client: ClientProfile,
    notification: PaymentNotification,
  ): Promise<{
    outcome: 'CONFIRMED' | 'PENDING' | 'FAILED' | 'DUPLICATE';
    paymentId: string | null;
    subscriptionCode: string | null;
    needsReconciliation: boolean;
    message: string;
  }> {
    const exchangeRate = this.defaultExchangeRate();
    const amountUsd =
      notification.currency === 'USD' ? notification.amount : notification.amount / exchangeRate;
    const durationDays = this.durationForAmount(amountUsd);

    const tariff = await this.resolveTariff(client);
    const isFirstSubscription = (await this.countSubscriptions(client.id)) === 0;
    const window = computeValidityWindow(durationDays, { currentEndsAt: client.subscriptionExpiresAt });

    const result = await this.dataSource.transaction(async (manager) => {
      const payment = manager.create(Payment, {
        clientId: client.id,
        method: notification.method,
        channel: PAYMENT_CHANNEL_BY_METHOD[notification.method],
        amountUsd: amountUsd.toFixed(2),
        amountCdf: notification.currency === 'CDF' ? notification.amount.toFixed(2) : null,
        exchangeRate: exchangeRate.toFixed(4),
        payerMsisdn: notification.payerMsisdn,
        operatorReference: notification.transactionId,
        status: PaymentStatus.CONFIRMED,
        organizationId: client.organizationId,
        paidAt: notification.receivedAt,
        confirmedAt: new Date(),
        recordedByLabel: `${notification.operator} (notification automatique)`,
        notes: notification.reference ? `Reference client : ${notification.reference}` : null,
        metadata: { notification: notification.raw, tariffGroupId: tariff?.id ?? null },
      });
      const savedPayment = await manager.save(payment);

      const subscription = manager.create(Subscription, {
        clientId: client.id,
        code: await this.generateUniqueCode(manager),
        durationDays,
        status: SubscriptionCodeStatus.ISSUED,
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        priceUsd: amountUsd.toFixed(2),
        priceCdf:
          notification.currency === 'CDF'
            ? notification.amount.toFixed(2)
            : toCdf(amountUsd, exchangeRate).toFixed(2),
        exchangeRate: exchangeRate.toFixed(4),
        discountUsd: '0.00',
        tariffGroupId: client.tariffGroupId,
        isFirstSubscription,
        issuedByLabel: `${notification.operator} (paiement automatique)`,
        issuedAt: new Date(),
        metadata: { paymentId: savedPayment.id, durationInferred: true },
      });
      const savedSubscription = await manager.save(subscription);

      savedPayment.subscriptionId = savedSubscription.id;
      await manager.save(savedPayment);

      await manager.update(ClientProfile, client.id, {
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionExpiresAt: window.endsAt,
        status: client.status === ClientStatus.PENDING ? ClientStatus.ACTIVE : client.status,
      });

      const refreshed = await manager.findOneOrFail(ClientProfile, { where: { id: client.id } });
      const sms = await this.sendCode(refreshed, savedSubscription);

      return { subscription: savedSubscription, payment: savedPayment, client: refreshed, sms };
    });

    this.logger.log(
      `Paiement ${notification.operator} ${notification.transactionId} encaisse pour ${result.client.zengoId ?? result.client.id} : ${durationDays} jours.`,
    );

    return {
      outcome: 'CONFIRMED',
      paymentId: result.payment.id,
      subscriptionCode: result.subscription.code,
      needsReconciliation: false,
      message: `Abonnement de ${durationDays} jours active, code ${result.subscription.code}.`,
    };
  }

  /** Retrouve le client a l'origine du paiement : numero, puis reference. */
  private async matchClientForNotification(notification: PaymentNotification): Promise<ClientProfile | null> {
    if (notification.payerMsisdn) {
      const byPhone = await this.clientRepository.findOne({
        where: [{ primaryPhone: notification.payerMsisdn }, { secondaryPhone: notification.payerMsisdn }],
      });
      if (byPhone) return byPhone;
    }

    if (notification.reference) {
      const zengoId = notification.reference.trim().toUpperCase();
      const byZengoId = await this.clientRepository.findOne({ where: { zengoId } });
      if (byZengoId) return byZengoId;

      const byCode = await this.subscriptionRepository.findOne({
        where: { code: normalizeSubscriptionCode(notification.reference) },
      });
      if (byCode) return this.loadClientOrFail(byCode.clientId);
    }

    return null;
  }

  /**
   * Duree deduite du montant recu : le client paie le prix d'une duree du
   * catalogue (ou davantage). A defaut de correspondance exacte, on retient la
   * duree la plus longue que le montant couvre, avec un minimum de 30 jours.
   */
  private durationForAmount(amountUsd: number): SubscriptionDuration {
    const durations = [SubscriptionDuration.DAYS_180, SubscriptionDuration.DAYS_90, SubscriptionDuration.DAYS_30].sort(
      (left, right) => right - left,
    ) as SubscriptionDuration[];

    const monthlyFee = this.defaultMonthlyFee();
    for (const duration of durations) {
      const expected = computeSubscriptionPrice({ monthlyFeeUsd: monthlyFee }, duration).amountUsd;
      if (amountUsd + 0.01 >= expected) return duration;
    }
    return SubscriptionDuration.DAYS_30;
  }

  private defaultExchangeRate(): number {
    return this.configService.get<number>('app.billing.exchangeRateUsdToCdf', 2800);
  }

  // ---------------------------------------------------------------------------
  // Emission (encaissement au guichet ou confirmation Mobile Money)
  // ---------------------------------------------------------------------------

  /**
   * Encaisse un abonnement et transmet le code au client.
   *
   * L'encaissement, l'emission du code, l'allongement de la validite et l'envoi
   * du SMS sont faits dans une seule transaction : un client ne doit jamais
   * payer sans recevoir son code, ni recevoir un code sans allongement.
   */
  async issue(actor: AuthenticatedUser, clientId: string, dto: SubscriptionPaymentDto): Promise<IssueResult> {
    if (!isSupportedDuration(dto.durationDays)) {
      throw new BadRequestException('Duree d abonnement non commercialisee (30, 90 ou 180 jours).');
    }

    const client = await this.loadClientOrFail(clientId);
    await this.assertInScope(actor, client.organizationId);

    if (client.status === ClientStatus.ARCHIVED) {
      throw new BadRequestException('Ce dossier client est archive : aucun abonnement ne peut y etre rattache.');
    }

    const tariff = await this.resolveTariff(client);
    const isFirstSubscription = (await this.countSubscriptions(client.id)) === 0;
    const price = computeSubscriptionPrice(
      {
        monthlyFeeUsd: tariff?.monthlyFeeUsd ? Number(tariff.monthlyFeeUsd) : this.defaultMonthlyFee(),
        registrationFeeUsd: tariff?.registrationFeeUsd ? Number(tariff.registrationFeeUsd) : 0,
      },
      dto.durationDays,
      { includeRegistrationFee: isFirstSubscription },
    );

    const amountUsd = dto.amountUsd !== undefined ? dto.amountUsd : price.amountUsd;
    if (amountUsd <= 0) {
      throw new BadRequestException('Le montant encaisse doit etre superieur a zero.');
    }

    const exchangeRate = await this.resolveExchangeRate(tariff, dto.exchangeRate);
    const currency = dto.currency ?? Currency.USD;
    const amountCdf = currency === Currency.CDF ? toCdf(amountUsd, exchangeRate) : null;

    // Un code peut toujours etre emis : la regeneration n'est proposee que dans
    // les cas ou l'ancien code n'a jamais ete active.
    const window = computeValidityWindow(dto.durationDays, {
      paidAt: dto.paidAt ?? new Date(),
      currentEndsAt: client.subscriptionExpiresAt,
    });

    return this.dataSource.transaction(async (manager) => {
      const payment = manager.create(Payment, {
        clientId: client.id,
        subscriptionId: null,
        method: dto.method,
        channel: PAYMENT_CHANNEL_BY_METHOD[dto.method],
        amountUsd: amountUsd.toFixed(2),
        amountCdf: amountCdf === null ? null : amountCdf.toFixed(2),
        exchangeRate: exchangeRate.toFixed(4),
        payerMsisdn: dto.payerMsisdn ?? client.primaryPhone,
        operatorReference: dto.operatorReference ?? null,
        status: PaymentStatus.CONFIRMED,
        organizationId: client.organizationId,
        paidAt: dto.paidAt ?? new Date(),
        confirmedAt: new Date(),
        recordedById: actor.id,
        recordedByLabel: `${actor.firstName} ${actor.lastName}`.trim(),
        notes: dto.note ?? null,
      });
      const savedPayment = await manager.save(payment);

      const subscription = manager.create(Subscription, {
        clientId: client.id,
        code: await this.generateUniqueCode(manager),
        durationDays: dto.durationDays,
        status: SubscriptionCodeStatus.ISSUED,
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        priceUsd: price.amountUsd.toFixed(2),
        priceCdf: amountCdf === null ? null : (toCdf(price.amountUsd, exchangeRate)).toFixed(2),
        exchangeRate: exchangeRate.toFixed(4),
        discountUsd: price.discountUsd.toFixed(2),
        tariffGroupId: client.tariffGroupId,
        isFirstSubscription,
        issuedById: actor.id,
        issuedByLabel: `${actor.firstName} ${actor.lastName}`.trim(),
        issuedAt: new Date(),
        notes: dto.note ?? null,
        metadata: { months: price.months, monthlyFeeUsd: price.monthlyFeeUsd },
      });
      const savedSubscription = await manager.save(subscription);

      savedPayment.subscriptionId = savedSubscription.id;
      await manager.save(savedPayment);

      await manager.update(ClientProfile, client.id, {
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionExpiresAt: window.endsAt,
        // Un client qui paie retrouve l'acces complet, meme si l'expiration
        // automatique l'avait restreint entre-temps.
        status: client.status === ClientStatus.PENDING ? ClientStatus.ACTIVE : client.status,
      });

      const refreshed = await manager.findOneOrFail(ClientProfile, { where: { id: client.id } });

      const sms = await this.sendCode(refreshed, savedSubscription);

      this.logger.log(
        `Abonnement ${savedSubscription.code} (${dto.durationDays} jours) emis pour ${refreshed.zengoId ?? refreshed.id} : ` +
          `${amountUsd} USD via ${dto.method}.`,
      );

      return {
        subscription: this.toView(savedSubscription),
        payment: savedPayment,
        client: refreshed,
        smsSent: sms.sent,
        smsError: sms.error,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Activation
  // ---------------------------------------------------------------------------

  /**
   * Activation d'un code par le client (application) ou par un agent (ecran
   * central, lorsque le client se presente au guichet).
   *
   * L'activation par un utilisateur non-client exige un role d'encadrement ; un
   * client ne peut activer que ses propres codes.
   */
  async activate(
    actor: AuthenticatedUser,
    dto: ActivateSubscriptionDto,
  ): Promise<{ subscription: SubscriptionView; client: ClientProfile; alreadyActive: boolean }> {
    const code = normalizeSubscriptionCode(dto.code);
    const subscription = await this.subscriptionRepository.findOne({ where: { code } });
    if (!subscription) {
      throw new NotFoundException("Ce code d'abonnement est inconnu.");
    }

    const client = await this.loadClientOrFail(subscription.clientId);
    await this.assertCanActivate(actor, client, dto.clientId);

    if (subscription.status === SubscriptionCodeStatus.CANCELLED) {
      throw new BadRequestException("Ce code a ete annule par le service client : contactez l'agence.");
    }
    if (subscription.status === SubscriptionCodeStatus.ACTIVATED) {
      return { subscription: this.toView(subscription), client, alreadyActive: true };
    }

    // La periode couverte par le code est appliquee au moment de l'activation.
    const window = computeValidityWindow(subscription.durationDays, {
      paidAt: new Date(),
      currentEndsAt: client.subscriptionExpiresAt,
    });

    return this.dataSource.transaction(async (manager) => {
      subscription.status = SubscriptionCodeStatus.ACTIVATED;
      subscription.activatedAt = new Date();
      subscription.activatedBy = this.isClientActor(actor) ? 'SELF_SERVICE' : 'BACK_OFFICE';
      subscription.startsAt = window.startsAt;
      subscription.endsAt = window.endsAt;
      const saved = await manager.save(subscription);

      await manager.update(ClientProfile, client.id, {
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionExpiresAt: window.endsAt,
        status: client.status === ClientStatus.PENDING ? ClientStatus.ACTIVE : client.status,
      });

      const refreshed = await manager.findOneOrFail(ClientProfile, { where: { id: client.id } });
      this.logger.log(`Code ${saved.code} active par ${subscription.activatedBy} pour ${refreshed.id}.`);

      return { subscription: this.toView(saved), client: refreshed, alreadyActive: false };
    });
  }

  /** Code emis mais jamais active : annulation par l'encadrement. */
  async cancel(actor: AuthenticatedUser, id: string, reason: string): Promise<SubscriptionView> {
    const subscription = await this.loadOrFail(id);
    const client = await this.loadClientOrFail(subscription.clientId);
    await this.assertInScope(actor, client.organizationId);

    if (subscription.status === SubscriptionCodeStatus.ACTIVATED) {
      throw new BadRequestException(
        "Ce code a deja ete active : utilisez la resiliation de l'abonnement, pas l'annulation du code.",
      );
    }
    if (subscription.status === SubscriptionCodeStatus.CANCELLED) {
      throw new ConflictException('Ce code est deja annule.');
    }

    subscription.status = SubscriptionCodeStatus.CANCELLED;
    subscription.cancelledAt = new Date();
    subscription.cancellationReason = reason;

    return this.toView(await this.subscriptionRepository.save(subscription));
  }

  // ---------------------------------------------------------------------------
  // Consultation
  // ---------------------------------------------------------------------------

  async findAll(actor: AuthenticatedUser, query: QuerySubscriptionsDto): Promise<PaginatedResult<SubscriptionView>> {
    // Un client ne consulte que ses propres codes : le portefeuille global
    // (montants encaisses, clients tiers) est reserve a l'encadrement.
    const ownProfileId = this.isClientActor(actor) ? (await this.findOwnProfileId(actor)) : null;
    if (this.isClientActor(actor) && !ownProfileId) {
      return buildPaginatedResult<SubscriptionView>([], 0, query.page, query.limit);
    }

    const builder = this.subscriptionRepository
      .createQueryBuilder('subscription')
      .leftJoinAndSelect('subscription.client', 'client')
      .leftJoinAndSelect('subscription.payments', 'payment');

    if (ownProfileId) {
      builder.andWhere('subscription.clientId = :own', { own: ownProfileId });
    } else {
      const scope = await this.scopeService.getAccessibleOrganizationIds(actor);
      if (scope !== null) {
        if (scope.length === 0) return buildPaginatedResult<SubscriptionView>([], 0, query.page, query.limit);
        builder.andWhere('client.organizationId IN (:...scope)', { scope });
      }
    }

    if (query.clientId) builder.andWhere('subscription.clientId = :clientId', { clientId: query.clientId });
    if (query.status) builder.andWhere('subscription.status = :status', { status: query.status });
    if (query.expiringSoon) {
      const threshold = new Date(Date.now() + (query.expiringInDays ?? 7) * 86_400_000);
      builder
        .andWhere('subscription.endsAt > :now', { now: new Date() })
        .andWhere('subscription.endsAt <= :threshold', { threshold });
    }

    builder.orderBy('subscription.createdAt', 'DESC');
    builder.skip((query.page - 1) * query.limit).take(query.limit);

    const [items, total] = await builder.getManyAndCount();
    return buildPaginatedResult(
      items.map((item) => this.toView(item)),
      total,
      query.page,
      query.limit,
    );
  }

  async findOne(actor: AuthenticatedUser, id: string): Promise<SubscriptionView> {
    const subscription = await this.loadOrFail(id);
    const client = await this.loadClientOrFail(subscription.clientId);
    await this.assertClientAccess(actor, client);
    return this.toView(subscription);
  }

  /** Etat d'abonnement d'un client, tel que l'affichent la console et le mobile. */
  async forClient(
    actor: AuthenticatedUser,
    clientId: string,
  ): Promise<{
    clientId: string;
    zengoId: string | null;
    status: SubscriptionStatus;
    effectiveStatus: SubscriptionStatus;
    expiresAt: Date | null;
    daysRemaining: number;
    validity: string;
    restricted: boolean;
    history: SubscriptionView[];
  }> {
    const client = await this.loadClientOrFail(clientId);
    await this.assertClientAccess(actor, client);

    const history = await this.subscriptionRepository.find({
      where: { clientId },
      order: { createdAt: 'DESC' },
      take: 20,
    });

    const effectiveStatus = deriveSubscriptionStatus({
      status: client.subscriptionStatus,
      endsAt: client.subscriptionExpiresAt,
    });

    return {
      clientId: client.id,
      zengoId: client.zengoId,
      status: client.subscriptionStatus,
      effectiveStatus,
      expiresAt: client.subscriptionExpiresAt,
      daysRemaining: daysRemaining(client.subscriptionExpiresAt),
      validity: describeValidity(client.subscriptionExpiresAt),
      restricted: shouldRestrictAccess(client.subscriptionStatus, client.subscriptionExpiresAt),
      history: history.map((item) => this.toView(item)),
    };
  }

  /** Indicateurs d'encaissement pour le tableau de bord finance. */
  async stats(actor: AuthenticatedUser, options: { days?: number } = {}): Promise<{
    windowDays: number;
    revenueUsd: number;
    revenueCdf: number;
    payments: number;
    newSubscriptions: number;
    activeClients: number;
    expiringSoon: number;
    expired: number;
    byMethod: { method: PaymentMethod; count: number; amountUsd: number }[];
    pendingPayments: number;
  }> {
    const days = options.days && options.days > 0 ? Math.min(options.days, 365) : 30;
    const since = new Date(Date.now() - days * 86_400_000);
    const scope = await this.scopeService.getAccessibleOrganizationIds(actor);

    const paymentBuilder = this.paymentRepository
      .createQueryBuilder('payment')
      .leftJoin('payment.client', 'client')
      .where('payment.createdAt >= :since', { since })
      .andWhere('payment.status = :confirmed', { confirmed: PaymentStatus.CONFIRMED });

    const clientBuilder = this.clientRepository.createQueryBuilder('client');
    if (scope !== null) {
      if (scope.length === 0) {
        return emptyStats(days);
      }
      paymentBuilder.andWhere('client.organizationId IN (:...scope)', { scope });
      clientBuilder.andWhere('client.organizationId IN (:...scope)', { scope });
    }

    const [revenue] = await paymentBuilder
      .clone()
      .select('COALESCE(SUM(payment.amountUsd), 0)::float', 'usd')
      .addSelect('COALESCE(SUM(payment.amountCdf), 0)::float', 'cdf')
      .addSelect('COUNT(*)::int', 'payments')
      .getRawMany<{ usd: number; cdf: number; payments: number }>();

    const byMethodRows = await paymentBuilder
      .clone()
      .select('payment.method', 'method')
      .addSelect('COUNT(*)::int', 'count')
      .addSelect('COALESCE(SUM(payment.amountUsd), 0)::float', 'amount_usd')
      .groupBy('payment.method')
      .getRawMany<{ method: PaymentMethod; count: number; amount_usd: number }>();

    const [counters] = await clientBuilder
      .clone()
      .select('COUNT(*) FILTER (WHERE client.status = :active)::int', 'active')
      .addSelect('COUNT(*) FILTER (WHERE client.subscriptionExpiresAt IS NOT NULL AND client.subscriptionExpiresAt <= :now)::int', 'expired')
      .setParameter('active', ClientStatus.ACTIVE)
      .setParameter('now', new Date())
      .getRawMany<{ active: number; expired: number }>();

    const expiringSoon = await clientBuilder
      .clone()
      .andWhere('client.subscriptionExpiresAt > :now', { now: new Date() })
      .andWhere('client.subscriptionExpiresAt <= :threshold', {
        threshold: new Date(Date.now() + 7 * 86_400_000),
      })
      .getCount();

    const subscriptionBuilder = this.subscriptionRepository
      .createQueryBuilder('subscription')
      .leftJoin('subscription.client', 'client')
      .where('subscription.createdAt >= :since', { since });
    if (scope !== null) subscriptionBuilder.andWhere('client.organizationId IN (:...scope)', { scope });

    const newSubscriptions = await subscriptionBuilder.getCount();

    // Paiements annonces mais jamais confirmes : c'est le premier indicateur de
    // fraude ou d'erreur de caisse, donc on le compte separement.
    const pendingBuilder = this.paymentRepository
      .createQueryBuilder('payment')
      .leftJoin('payment.client', 'client')
      .where('payment.createdAt >= :since', { since })
      .andWhere('payment.status = :pending', { pending: PaymentStatus.PENDING });
    if (scope !== null) pendingBuilder.andWhere('client.organizationId IN (:...scope)', { scope });
    const pendingPayments = await pendingBuilder.getCount();

    return {
      windowDays: days,
      revenueUsd: round2(Number(revenue?.usd ?? 0)),
      revenueCdf: round2(Number(revenue?.cdf ?? 0)),
      payments: Number(revenue?.payments ?? 0),
      newSubscriptions,
      activeClients: Number(counters?.active ?? 0),
      expiringSoon,
      expired: Number(counters?.expired ?? 0),
      byMethod: byMethodRows
        .map((row) => ({
          method: row.method,
          count: Number(row.count),
          amountUsd: round2(Number(row.amount_usd)),
        }))
        .sort((left, right) => right.amountUsd - left.amountUsd),
      pendingPayments,
    };
  }

  // ---------------------------------------------------------------------------
  // Expiration automatique
  // ---------------------------------------------------------------------------

  /**
   * Restreint les clients dont l'abonnement est echou.
   *
   * Le client passe en `EXPIRED` : l'acces reste possible pour le paiement, mais
   * la surveillance et les services associes sont restreints conformement au
   * cahier des charges. Les codes jamais actives et perimes sont marques pour
   * que le service client sache lesquels relancer.
   */
  async expireDue(): Promise<{ clients: number; codes: number }> {
    const now = new Date();

    const dueClients = await this.clientRepository.find({
      where: {
        subscriptionExpiresAt: LessThanOrEqual(now),
        subscriptionStatus: In([SubscriptionStatus.ACTIVE, SubscriptionStatus.PENDING]),
        status: Not(ClientStatus.ARCHIVED),
      },
      select: { id: true, zengoId: true, subscriptionExpiresAt: true, status: true },
      take: 500,
    });

    for (const client of dueClients) {
      await this.clientRepository.update(client.id, {
        subscriptionStatus: SubscriptionStatus.EXPIRED,
        status: client.status === ClientStatus.PENDING ? ClientStatus.PENDING : ClientStatus.EXPIRED,
      });
      this.logger.warn(
        `Abonnement de ${client.zengoId ?? client.id} expire le ${
          client.subscriptionExpiresAt?.toISOString().slice(0, 10) ?? '?'
        } : acces restreint.`,
      );
    }

    // Codes emis il y a plus de 30 jours et jamais actives : ils ne serviront
    // plus, le service client peut les considerer comme perdus.
    const staleCodes = await this.subscriptionRepository.find({
      where: {
        status: SubscriptionCodeStatus.ISSUED,
        issuedAt: LessThanOrEqual(new Date(now.getTime() - 30 * 86_400_000)),
        activatedAt: IsNull(),
      },
      select: { id: true },
      take: 500,
    });
    if (staleCodes.length > 0) {
      await this.subscriptionRepository.update(
        { id: In(staleCodes.map((code) => code.id)) },
        { status: SubscriptionCodeStatus.EXPIRED },
      );
    }

    return { clients: dueClients.length, codes: staleCodes.length };
  }

  /** Clients dont l'abonnement arrive a echeance : relance commerciale. */
  async findExpiringSoon(days = 7): Promise<ClientProfile[]> {
    const now = new Date();
    return this.clientRepository.find({
      where: {
        subscriptionExpiresAt: LessThanOrEqual(new Date(now.getTime() + days * 86_400_000)),
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        status: Not(ClientStatus.ARCHIVED),
      },
      order: { subscriptionExpiresAt: 'ASC' },
      take: 500,
    });
  }

  /** Relance le client par SMS a l'approche de l'echeance. */
  async notifyExpiringSoon(): Promise<number> {
    const clients = await this.findExpiringSoon(7);
    let sent = 0;

    for (const client of clients) {
      try {
        await this.alertSms.sendToClient(client.id, SmsTemplate.SUBSCRIPTION_EXPIRING, {
          endsAt: formatDate(client.subscriptionExpiresAt),
          daysRemaining: daysRemaining(client.subscriptionExpiresAt),
        });
        sent += 1;
      } catch (error) {
        this.logger.error(
          `Relance d'abonnement non envoyee a ${client.zengoId ?? client.id} : ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return sent;
  }

  // ---------------------------------------------------------------------------
  // Outils internes
  // ---------------------------------------------------------------------------

  private async sendCode(client: ClientProfile, subscription: Subscription): Promise<{ sent: boolean; error: string | null }> {
    try {
      await this.alertSms.sendToClient(client.id, SmsTemplate.SUBSCRIPTION_ACTIVATED, {
        code: subscription.code,
        durationDays: subscription.durationDays,
        endsAt: formatDate(subscription.endsAt),
      });
      return { sent: true, error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Code ${subscription.code} non transmis a ${client.id} : ${message}`);
      return { sent: false, error: message };
    }
  }

  private async generateUniqueCode(manager: EntityManager): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = buildSubscriptionCode();
      const existing = await manager.findOne(Subscription, { where: { code: candidate } });
      if (!existing) return candidate;
    }
    throw new ConflictException('Impossible de generer un code unique ; reessayez.');
  }

  private async loadOrFail(id: string): Promise<Subscription> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { id },
      relations: { payments: true },
    });
    if (!subscription) throw new NotFoundException('Abonnement introuvable.');
    return subscription;
  }

  private async loadClientOrFail(id: string): Promise<ClientProfile> {
    const client = await this.clientRepository.findOne({ where: { id }, relations: { tariffGroup: true } });
    if (!client) throw new NotFoundException('Client introuvable.');
    return client;
  }

  private countSubscriptions(clientId: string): Promise<number> {
    return this.subscriptionRepository.count({ where: { clientId } });
  }

  private async resolveTariff(client: ClientProfile): Promise<TariffGroup | null> {
    if (client.tariffGroup) return client.tariffGroup;
    if (!client.tariffGroupId) return null;
    return this.tariffRepository.findOne({ where: { id: client.tariffGroupId } });
  }

  private async resolveExchangeRate(tariff: TariffGroup | null, provided?: number): Promise<number> {
    if (provided && provided > 0) return provided;
    if (tariff?.exchangeRateUsdToCdf) return Number(tariff.exchangeRateUsdToCdf);
    return this.configService.get<number>('app.billing.exchangeRateUsdToCdf', 2800);
  }

  private defaultMonthlyFee(): number {
    return this.configService.get<number>('app.billing.defaultMonthlyFeeUsd', 20);
  }

  /** Un client ne peut agir que sur son propre dossier ; un agent sur son perimetre. */
  private async assertCanActivate(
    actor: AuthenticatedUser,
    client: ClientProfile,
    targetClientId?: string,
  ): Promise<void> {
    await this.assertClientAccess(actor, client);
    if (targetClientId && targetClientId !== client.id) {
      throw new BadRequestException('Le code ne correspond pas au client indique.');
    }
  }

  /**
   * Un client connecte n'agit que sur son propre dossier ; un agent doit avoir
   * le client dans son perimetre organisationnel.
   */
  private async assertClientAccess(actor: AuthenticatedUser, client: ClientProfile): Promise<void> {
    if (this.isClientActor(actor)) {
      const ownProfileId = await this.findOwnProfileId(actor);
      if (!ownProfileId || ownProfileId !== client.id) {
        throw new ForbiddenException("Ce code d'abonnement appartient a un autre dossier client.");
      }
      return;
    }
    await this.assertInScope(actor, client.organizationId);
  }

  /** Fiche client rattachee au compte connecte (null si aucune). */
  private async findOwnProfileId(actor: AuthenticatedUser): Promise<string | null> {
    const profile = await this.clientRepository.findOne({ where: { userId: actor.id }, select: { id: true } });
    return profile?.id ?? null;
  }

  private async assertInScope(actor: AuthenticatedUser, organizationId: string | null): Promise<void> {
    if (!organizationId) return;
    if (this.isClientActor(actor)) return;
    await this.scopeService.assertInScope(actor, organizationId);
  }

  /** Un client connecte n'agit que sur son propre dossier. */
  private isClientActor(actor: AuthenticatedUser): boolean {
    return actor.roles.includes(Role.CLIENT) || actor.roles.includes(Role.CLIENT_ADMIN);
  }

  private toView(subscription: Subscription): SubscriptionView {
    const effectiveStatus = deriveSubscriptionStatus({
      status: subscription.startsAt > new Date() ? SubscriptionStatus.PENDING : SubscriptionStatus.ACTIVE,
      startsAt: subscription.startsAt,
      endsAt: subscription.endsAt,
    });

    return {
      id: subscription.id,
      code: subscription.code,
      status: subscription.status,
      effectiveStatus,
      durationDays: subscription.durationDays,
      startsAt: subscription.startsAt,
      endsAt: subscription.endsAt,
      daysRemaining: daysRemaining(subscription.endsAt),
      validity: describeValidity(subscription.endsAt),
      priceUsd: subscription.priceUsd,
      priceCdf: subscription.priceCdf,
      currency: subscription.priceCdf ? Currency.CDF : Currency.USD,
      discountUsd: subscription.discountUsd,
      isFirstSubscription: subscription.isFirstSubscription,
      activatedAt: subscription.activatedAt,
      issuedAt: subscription.issuedAt,
      issuedByLabel: subscription.issuedByLabel,
      notes: subscription.notes,
      client: subscription.client
        ? {
            id: subscription.client.id,
            zengoId: subscription.client.zengoId ?? null,
            fullName: subscription.client.fullName,
            primaryPhone: subscription.client.primaryPhone,
          }
        : null,
    };
  }
}

const emptyStats = (days: number) => ({
  windowDays: days,
  revenueUsd: 0,
  revenueCdf: 0,
  payments: 0,
  newSubscriptions: 0,
  activeClients: 0,
  expiringSoon: 0,
  expired: 0,
  byMethod: [],
  pendingPayments: 0,
});

const emptyReconciliation = (days: number) => ({
  windowDays: days,
  byOperator: [],
  pending: { count: 0, amountUsd: 0, amountCdf: 0, items: [] },
  confirmed: { count: 0, amountUsd: 0, amountCdf: 0 },
  byDay: [],
});

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Date lisible dans un SMS : `12/11/2026`. */
const formatDate = (date: Date | null | undefined): string => {
  if (!date) return '-';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
};
