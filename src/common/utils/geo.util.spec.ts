import {
  bearingDegrees,
  describeDistance,
  estimateEtaMinutes,
  haversineMeters,
  isValidCoordinate,
} from '@common/utils/geo.util';

describe('geo.util', () => {
  describe('isValidCoordinate', () => {
    it('accepte des coordonnees dans les bornes', () => {
      expect(isValidCoordinate(-4.325, 15.322)).toBe(true);
      expect(isValidCoordinate(0, 0)).toBe(true);
      expect(isValidCoordinate(90, 180)).toBe(true);
    });

    it('refuse les valeurs hors bornes ou absentes', () => {
      expect(isValidCoordinate(null, 15)).toBe(false);
      expect(isValidCoordinate(15, undefined)).toBe(false);
      expect(isValidCoordinate(91, 0)).toBe(false);
      expect(isValidCoordinate(0, 181)).toBe(false);
      expect(isValidCoordinate(Number.NaN, 0)).toBe(false);
    });
  });

  describe('haversineMeters', () => {
    it('renvoie 0 pour un meme point', () => {
      expect(haversineMeters({ latitude: -4.325, longitude: 15.322 }, { latitude: -4.325, longitude: 15.322 })).toBe(0);
    });

    it('mesure un degre de latitude a environ 111 km', () => {
      const distance = haversineMeters({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 });
      expect(distance).toBeGreaterThan(110_000);
      expect(distance).toBeLessThan(112_000);
    });

    it('mesure la distance Kinshasa - Lubumbashi a environ 1560 km a vol d oiseau', () => {
      const distance = haversineMeters(
        { latitude: -4.325, longitude: 15.322 },
        { latitude: -11.6609, longitude: 27.4794 },
      );
      expect(distance).toBeGreaterThan(1_500_000);
      expect(distance).toBeLessThan(1_700_000);
    });

    it('est symetrique', () => {
      const a = { latitude: -4.325, longitude: 15.322 };
      const b = { latitude: -11.6609, longitude: 27.4794 };
      expect(haversineMeters(a, b)).toBe(haversineMeters(b, a));
    });
  });

  describe('bearingDegrees', () => {
    it('pointe au nord, a l est, au sud et a l ouest', () => {
      const origin = { latitude: 0, longitude: 0 };
      expect(bearingDegrees(origin, { latitude: 1, longitude: 0 })).toBe(0);
      expect(bearingDegrees(origin, { latitude: 0, longitude: 1 })).toBe(90);
      expect(bearingDegrees(origin, { latitude: -1, longitude: 0 })).toBe(180);
      expect(bearingDegrees(origin, { latitude: 0, longitude: -1 })).toBe(270);
    });
  });

  describe('estimateEtaMinutes', () => {
    it('renvoie 0 pour une distance nulle', () => {
      expect(estimateEtaMinutes(0)).toBe(0);
    });

    it('arrondit toujours au superieur', () => {
      // 14 km a 28 km/h = 30 minutes.
      expect(estimateEtaMinutes(14_000)).toBe(30);
      // 1 km -> 2,14 min -> 3 minutes (jamais annonce optimiste).
      expect(estimateEtaMinutes(1_000)).toBe(3);
    });

    it('respecte une vitesse personnalisee et retombe sur la valeur par defaut si absurde', () => {
      expect(estimateEtaMinutes(10_000, 60)).toBe(10);
      expect(estimateEtaMinutes(10_000, 0)).toBe(estimateEtaMinutes(10_000));
    });
  });

  describe('describeDistance', () => {
    it('affiche les metres puis les kilometres', () => {
      expect(describeDistance(850)).toBe('850 m');
      expect(describeDistance(1500)).toBe('1.5 km');
      expect(describeDistance(null)).toBe('distance inconnue');
    });
  });
});
