import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlertDispatch } from '@database/entities/alert-dispatch.entity';
import { Alert } from '@database/entities/alert.entity';
import { FieldTeam } from '@database/entities/field-team.entity';
import { InterventionReport } from '@database/entities/intervention-report.entity';
import { Intervention } from '@database/entities/intervention.entity';
import { Organization } from '@database/entities/organization.entity';
import { TeamPosition } from '@database/entities/team-position.entity';
import { AlertsModule } from '@modules/alerts/alerts.module';
import { FieldTeamsController } from '@modules/interventions/field-teams.controller';
import { FieldTeamsService } from '@modules/interventions/field-teams.service';
import { InterventionsController } from '@modules/interventions/interventions.controller';
import { InterventionsService } from '@modules/interventions/interventions.service';
import { InterventionsTasks } from '@modules/interventions/interventions.tasks';
import { OrganizationsModule } from '@modules/organizations/organizations.module';

/**
 * Module « Interventions terrain » (iteration 3).
 *
 * Dependances : AlertsModule (lecture/ecriture du cycle de vie de l'alerte via
 * `AlertLifecycleService`) et OrganizationsModule (perimetre multi-tenant,
 * ancetres pour les salles temps reel).
 *
 * Le graphe reste acyclique : AlertsModule n'importe pas ce module - une alerte
 * ne connait pas ses missions, c'est la mission qui reference l'alerte.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      FieldTeam,
      TeamPosition,
      Intervention,
      InterventionReport,
      Alert,
      AlertDispatch,
      Organization,
    ]),
    OrganizationsModule,
    AlertsModule,
  ],
  controllers: [FieldTeamsController, InterventionsController],
  providers: [FieldTeamsService, InterventionsService, InterventionsTasks],
  exports: [FieldTeamsService, InterventionsService],
})
export class InterventionsModule {}
