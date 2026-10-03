import { Repository } from 'typeorm';
import { OfferPack } from '@common/enums/client.enum';
import { TariffGroup } from '@database/entities/tariff-group.entity';
import { TariffsService } from './tariffs.service';

/** Groupe tarifaire Standard du cahier des charges. */
const standardGroup = (overrides: Partial<TariffGroup> = {}): TariffGroup =>
  ({
    code: 'STANDARD',
    name: 'Standard - Particuliers / Foyers',
    offerPack: OfferPack.STANDARD,
    registrationFeeUsd: '150.00',
    monthlyFeeUsd: '22.00',
    includedSosButtons: 1,
    sosButtonUnitPriceUsd: '5.00',
    maxSosButtons: 10,
    exchangeRateUsdToCdf: '2800.0000',
    ...overrides,
  }) as TariffGroup;

describe('TariffsService.computePrice', () => {
  const service = new TariffsService({} as Repository<TariffGroup>);

  it('applique le prix du kit standard sans bouton supplementaire', () => {
    const price = service.computePrice(standardGroup(), 1);
    expect(price.totalKitUsd).toBe(150);
    expect(price.extraSosButtons).toBe(0);
    expect(price.sosButtonsTotalUsd).toBe(0);
    expect(price.totalMonthlyUsd).toBe(22);
  });

  it('reproduit l exemple du cahier des charges : 3 boutons -> 160 USD', () => {
    const price = service.computePrice(standardGroup(), 3);
    expect(price.extraSosButtons).toBe(2);
    expect(price.sosButtonsTotalUsd).toBe(10);
    expect(price.totalKitUsd).toBe(160);
  });

  it('reproduit l exemple du cahier des charges : 10 boutons -> 195 USD', () => {
    const price = service.computePrice(standardGroup(), 10);
    expect(price.extraSosButtons).toBe(9);
    expect(price.totalKitUsd).toBe(195);
  });

  it('convertit en CDF avec le taux du groupe', () => {
    const price = service.computePrice(standardGroup(), 3);
    expect(price.totalKitCdf).toBe(448_000);
    expect(price.totalMonthlyCdf).toBe(61_600);
  });

  it('ne propose pas de conversion lorsque le taux est absent', () => {
    const price = service.computePrice(standardGroup({ exchangeRateUsdToCdf: null }), 3);
    expect(price.exchangeRateUsdToCdf).toBeNull();
    expect(price.totalKitCdf).toBeNull();
    expect(price.totalMonthlyCdf).toBeNull();
  });

  it('ne facture jamais negativement si moins de boutons que l inclus', () => {
    const price = service.computePrice(standardGroup({ includedSosButtons: 3 }), 2);
    expect(price.extraSosButtons).toBe(0);
    expect(price.totalKitUsd).toBe(150);
  });
});
