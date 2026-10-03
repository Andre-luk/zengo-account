import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { AppBaseEntity } from '@common/entities/app-base.entity';
import { Role } from '@common/enums/role.enum';
import { Organization } from '@database/entities/organization.entity';
import { User } from '@database/entities/user.entity';

/**
 * Appartenance d'un utilisateur a une organisation, avec le role porte dans
 * cette organisation. Un utilisateur peut appartenir a plusieurs organisations
 * (ex. compte institution multi-utilisateurs, technicien multi-agences).
 */
@Entity('user_organizations')
@Unique('uq_user_organization_role', ['userId', 'organizationId', 'role'])
@Index(['organizationId'])
export class UserOrganization extends AppBaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, (user) => user.memberships, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ type: 'enum', enum: Role })
  role!: Role;

  /** Organisation de rattachement principale (utilisee pour le scoping par defaut). */
  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary!: boolean;
}
