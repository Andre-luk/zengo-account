/**
 * Roles metier de la plateforme Zengo Account.
 *
 * La hierarchie organisationnelle (National -> Region -> Agence -> PDC) est
 * portee par l'entite Organization ; le role porte les droits fonctionnels.
 */
export enum Role {
  /** Direction generale : acces total a la plateforme. */
  SUPER_ADMIN = 'SUPER_ADMIN',
  /** Direction generale (national) : supervision complete, hors secrets techniques. */
  NATIONAL_DIRECTOR = 'NATIONAL_DIRECTOR',
  /** Direction centrale des operations techniques : plateforme, devices, IA. */
  TECHNICAL_DIRECTOR = 'TECHNICAL_DIRECTOR',
  /** Responsable plateforme Zengo : creation/activation des comptes clients. */
  PLATFORM_MANAGER = 'PLATFORM_MANAGER',
  /** Direction administrative & financiere : tarifs, taux de change, groupes. */
  DAF = 'DAF',
  /** Comptabilite : paiements, factures, reconciliation. */
  ACCOUNTANT = 'ACCOUNTANT',
  /** Directeur controle qualite : double validation des mutations. */
  QUALITY_DIRECTOR = 'QUALITY_DIRECTOR',
  /** Chef de zone regionale. */
  REGION_MANAGER = 'REGION_MANAGER',
  /** Chef d'agence / point de distribution (PDC). */
  AGENCY_MANAGER = 'AGENCY_MANAGER',
  /** Technicien installateur. */
  TECHNICIAN = 'TECHNICIAN',
  /** Operateur du Zengo Monitoring Center. */
  OPERATOR = 'OPERATOR',
  /** Superviseur regional du ZMC. */
  SUPERVISOR = 'SUPERVISOR',
  /** Agent d'une station de reception d'alertes (SRA). */
  STATION_AGENT = 'STATION_AGENT',
  /** Agent terrain (police, pompiers, ambulance). */
  FIELD_AGENT = 'FIELD_AGENT',
  /** Personnel de sante (e-sante). */
  HEALTH_STAFF = 'HEALTH_STAFF',
  /** Administrateur d'un compte institution multi-utilisateurs. */
  CLIENT_ADMIN = 'CLIENT_ADMIN',
  /** Client final (particulier ou entreprise). */
  CLIENT = 'CLIENT',
}

/** Roles disposant d'une vision nationale (toutes les organisations). */
export const NATIONAL_SCOPE_ROLES: ReadonlySet<Role> = new Set<Role>([
  Role.SUPER_ADMIN,
  Role.NATIONAL_DIRECTOR,
  Role.TECHNICAL_DIRECTOR,
  Role.DAF,
  Role.QUALITY_DIRECTOR,
]);
