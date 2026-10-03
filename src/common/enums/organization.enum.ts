/** Types d'entites organisationnelles (multi-tenant hierarchique). */
export enum OrganizationType {
  /** Siege / direction generale. */
  NATIONAL = 'NATIONAL',
  /** Zone regionale (ex. Kinshasa, Kolwezi, Lubumbashi). */
  REGION = 'REGION',
  /** Agence locale / point de distribution (PDC). */
  AGENCY = 'AGENCY',
  /** Station de reception d'alertes (police, pompiers, hopital). */
  STATION = 'STATION',
  /** Compte institution (ecole, eglise, entreprise, hopital partenaire). */
  ENTERPRISE = 'ENTERPRISE',
}

/** Nature d'une station de reception d'alertes. */
export enum StationType {
  FIRE = 'FIRE',
  INTRUSION = 'INTRUSION',
  MEDICAL = 'MEDICAL',
  MIXED = 'MIXED',
}

export enum OrganizationStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  ARCHIVED = 'ARCHIVED',
}
