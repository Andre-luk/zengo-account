import { Column, Entity, Index, OneToMany } from 'typeorm';
import { AppBaseEntity } from '@common/entities/app-base.entity';
import { Language } from '@common/enums/client.enum';
import { UserStatus } from '@common/enums/user.enum';
import { UserOrganization } from '@database/entities/user-organization.entity';

/**
 * Utilisateur de la plateforme (agents, operateurs, techniciens, clients...).
 *
 * L'email et le telephone sont tous deux facultatifs au niveau du modele mais
 * l'un des deux doit etre renseigne (valide au niveau des DTO / du service).
 */
@Entity('users')
@Index(['email'], { unique: true, where: 'email IS NOT NULL' })
@Index(['phone'], { unique: true, where: 'phone IS NOT NULL' })
export class User extends AppBaseEntity {
  @Column({ type: 'varchar', length: 160, nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone!: string | null;

  @Column({ name: 'password_hash', type: 'varchar', length: 255, select: false })
  passwordHash!: string;

  @Column({ name: 'first_name', type: 'varchar', length: 80 })
  firstName!: string;

  @Column({ name: 'last_name', type: 'varchar', length: 80 })
  lastName!: string;

  @Column({ name: 'preferred_language', type: 'enum', enum: Language, default: Language.FRENCH })
  preferredLanguage!: Language;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.PENDING })
  status!: UserStatus;

  /** Compte technique disposant d'un acces transversal (Direction generale). */
  @Column({ name: 'is_super_admin', type: 'boolean', default: false })
  isSuperAdmin!: boolean;

  @Column({ name: 'must_change_password', type: 'boolean', default: false })
  mustChangePassword!: boolean;

  @Column({ name: 'two_factor_enabled', type: 'boolean', default: false })
  twoFactorEnabled!: boolean;

  @Column({ name: 'two_factor_secret', type: 'varchar', length: 255, nullable: true, select: false })
  twoFactorSecret!: string | null;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;

  @Column({ name: 'last_login_ip', type: 'varchar', length: 64, nullable: true })
  lastLoginIp!: string | null;

  @Column({ name: 'failed_login_attempts', type: 'int', default: 0 })
  failedLoginAttempts!: number;

  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  lockedUntil!: Date | null;

  @OneToMany(() => UserOrganization, (membership) => membership.user)
  memberships!: UserOrganization[];

  get fullName(): string {
    return `${this.firstName} ${this.lastName}`.trim();
  }
}
