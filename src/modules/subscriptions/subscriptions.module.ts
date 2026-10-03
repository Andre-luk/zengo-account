import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientProfile } from '@database/entities/client-profile.entity';
import { Payment } from '@database/entities/payment.entity';
import { Subscription } from '@database/entities/subscription.entity';
import { TariffGroup } from '@database/entities/tariff-group.entity';
import { AlertsModule } from '@modules/alerts/alerts.module';
import { OrganizationsModule } from '@modules/organizations/organizations.module';
import { SubscriptionsController } from '@modules/subscriptions/subscriptions.controller';
import { SubscriptionsService } from '@modules/subscriptions/subscriptions.service';
import { SubscriptionsTasks } from '@modules/subscriptions/subscriptions.tasks';

/**
 * Module Abonnements & encaissements (iteration 4).
 *
 * Il consomme le canal SMS du module Alertes pour transmettre le code au
 * client : le graphe de modules reste acyclique (Alertes n'a pas connaissance
 * des abonnements). Les webhooks des operateurs Mobile Money viendront
 * confirmer les paiements `PENDING` par le meme service d'encaissement.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Subscription, Payment, ClientProfile, TariffGroup]),
    OrganizationsModule,
    AlertsModule,
  ],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, SubscriptionsTasks],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
