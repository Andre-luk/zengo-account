import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Currency } from '@common/enums/client.enum';
import {
  PaymentMethod,
  SubscriptionCodeStatus,
  SubscriptionDuration,
} from '@common/enums/subscription.enum';
import { PaginationQueryDto } from '@common/dto/pagination.dto';

/**
 * Encaissement d'un abonnement.
 *
 * Le montant peut etre impose par le serveur (prix du groupe tarifaire) ou
 * fourni par l'agent lorsqu'un arrangement commercial a ete conclu ; le taux de
 * change est celui du jour, sauf saisie explicite.
 */
export class SubscriptionPaymentDto {
  @ApiProperty({ enum: SubscriptionDuration, description: 'Duree souscrite, en jours.' })
  @IsEnum(SubscriptionDuration)
  @Type(() => Number)
  durationDays!: SubscriptionDuration;

  @ApiProperty({ enum: PaymentMethod, description: 'Moyen de paiement utilise.' })
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @ApiPropertyOptional({ description: 'Montant encaisse en USD (prix du groupe tarifaire si absent).' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  amountUsd?: number;

  @ApiPropertyOptional({ enum: Currency, default: Currency.USD })
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @ApiPropertyOptional({ description: 'Taux USD vers CDF du jour.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(1)
  exchangeRate?: number;

  @ApiPropertyOptional({ description: "Numero du payeur Mobile Money (par defaut le numero principal du client)." })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  payerMsisdn?: string;

  @ApiPropertyOptional({ description: "Reference de transaction de l'operateur." })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  operatorReference?: string;

  @ApiPropertyOptional({ description: "Date d'encaissement si elle differe de la saisie." })
  @IsOptional()
  @Type(() => Date)
  paidAt?: Date;

  @ApiPropertyOptional({
    description:
      "Agent encaisseur lorsque le paiement n'est pas saisi par lui-même (saisie différée de la caisse).",
  })
  @IsOptional()
  @IsUUID()
  recordedById?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ActivateSubscriptionDto {
  @ApiProperty({ description: 'Code recu par SMS, au format ZG-XXXX-XXXX.', example: 'ZG-K4PM-7RTQ' })
  @IsString()
  @MinLength(8)
  @MaxLength(24)
  @Matches(/^[A-Za-z0-9\-\s]+$/, { message: 'Le code ne peut contenir que des lettres, des chiffres et des tirets.' })
  code!: string;

  @ApiPropertyOptional({
    description:
      "Client dont l'abonnement est etendu. Ignore lorsqu'un client active son propre code depuis l'application.",
  })
  @IsOptional()
  @IsUUID()
  clientId?: string;
}

export class QuerySubscriptionsDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional({ enum: SubscriptionCodeStatus })
  @IsOptional()
  @IsEnum(SubscriptionCodeStatus)
  status?: SubscriptionCodeStatus;

  @ApiPropertyOptional({ description: 'Ne retourner que les abonnements proches de leur echeance.' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  expiringSoon?: boolean;

  @ApiPropertyOptional({ description: "Horizon de l'echeance, en jours.", default: 7 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(180)
  expiringInDays?: number;
}
