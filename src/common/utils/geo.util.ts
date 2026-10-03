/**
 * Geometrie appliquee au pilotage des equipes terrain.
 *
 * Les calculs sont volontairement sans dependance externe : l'affectation de
 * l'equipe la plus proche doit rester deterministe et testable, sans appel a un
 * fournisseur de cartographie.
 */

/** Rayon moyen de la Terre, en metres (sphere de reference WGS84). */
export const EARTH_RADIUS_METERS = 6_371_000;

/** Vitesse moyenne retenue pour une estimation d'arrivee en milieu urbain. */
export const DEFAULT_URBAN_SPEED_KMH = 28;

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export const isValidCoordinate = (
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): boolean => {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return false;
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) return false;
  return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
};

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
const toDegrees = (radians: number): number => (radians * 180) / Math.PI;

/** Distance orthodromique (formule de haversine), en metres. */
export const haversineMeters = (from: Coordinates, to: Coordinates): number => {
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLng = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);

  const a =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;

  return Math.round(2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a))));
};

/** Cap (azimut) de `from` vers `to`, en degres (0 = nord, 90 = est). */
export const bearingDegrees = (from: Coordinates, to: Coordinates): number => {
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const deltaLng = toRadians(to.longitude - from.longitude);

  const y = Math.sin(deltaLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);

  return Math.round((toDegrees(Math.atan2(y, x)) + 360) % 360);
};

/**
 * Estime le temps de trajet en minutes.
 *
 * On borne volontairement le resultat : une distance nulle correspond a un
 * deplacement deja termine (0 min) et chaque minute est arrondie au superieur
 * pour ne jamais annoncer une arrivee optimiste.
 */
export const estimateEtaMinutes = (
  distanceMeters: number,
  speedKmh: number = DEFAULT_URBAN_SPEED_KMH,
): number => {
  if (distanceMeters <= 0) return 0;
  const speed = speedKmh > 0 ? speedKmh : DEFAULT_URBAN_SPEED_KMH;
  const hours = distanceMeters / 1000 / speed;
  return Math.max(1, Math.ceil(hours * 60));
};

/** Libelle court d'une distance, utilise dans les messages d'alerte. */
export const describeDistance = (distanceMeters: number | null | undefined): string => {
  if (distanceMeters === null || distanceMeters === undefined) return 'distance inconnue';
  if (distanceMeters < 1000) return `${distanceMeters} m`;
  return `${(distanceMeters / 1000).toFixed(1)} km`;
};
