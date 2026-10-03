import { Language } from '@common/enums/client.enum';
import { OrganizationType } from '@common/enums/organization.enum';
import { Role } from '@common/enums/role.enum';

/** Appartenance resolue d'un utilisateur (utilisee pour le scoping multi-tenant). */
export interface UserMembership {
  organizationId: string;
  organizationName: string;
  organizationType?: OrganizationType;
  /** Chemin materialise de l'organisation, ex. `/a1/b2`. */
  organizationPath: string;
  role: Role;
  isPrimary: boolean;
}

/** Utilisateur authentifie attache a la requete (`request.user`). */
export interface AuthenticatedUser {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string;
  lastName: string;
  preferredLanguage: Language;
  isSuperAdmin: boolean;
  roles: Role[];
  primaryOrganizationId: string | null;
  memberships: UserMembership[];
}

/** Contenu du JWT d'acces. */
export interface AccessTokenPayload {
  sub: string;
  /** Version de token : incrementee pour invalider les sessions. */
  typ: 'access';
  iat?: number;
  exp?: number;
}
