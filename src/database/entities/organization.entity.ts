import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { AppBaseEntity } from '@common/entities/app-base.entity';
import { OrganizationStatus, OrganizationType, StationType } from '@common/enums/organization.enum';

/**
 * Entite organisationnelle : porte la hierarchie multi-tenant
 * National -> Region -> Agence (PDC) -> Station / Institution.
 *
 * `path` est un chemin materialise des ancetres (identifiants separes par `/`,
 * soi-meme inclus, ex. `/natId/regId/agencyId`). Il permet de recuperer tous les
 * descendants d'une organisation avec un simple `LIKE '/natId/regId/%'`.
 */
@Entity('organizations')
@Index(['type'])
@Index(['parentId'])
@Index(['path'])
export class Organization extends AppBaseEntity {
  @Column({ type: 'varchar', length: 160 })
  name!: string;

  /** Code court unique (ex. `KIN`, `KIN-AG01`, `SRA-FIRE-KIN`). */
  @Column({ type: 'varchar', length: 32, unique: true })
  code!: string;

  @Column({ type: 'enum', enum: OrganizationType })
  type!: OrganizationType;

  /** Renseigne uniquement pour `type = STATION`. */
  @Column({ name: 'station_type', type: 'enum', enum: StationType, nullable: true })
  stationType!: StationType | null;

  @Column({ type: 'enum', enum: OrganizationStatus, default: OrganizationStatus.ACTIVE })
  status!: OrganizationStatus;

  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId!: string | null;

  @ManyToOne(() => Organization, (organization) => organization.children, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'parent_id' })
  parent!: Organization | null;

  @OneToMany(() => Organization, (organization) => organization.parent)
  children!: Organization[];

  /** Chemin materialise, ex. `/a1/b2/c3`. */
  @Column({ type: 'varchar', length: 1024, default: '' })
  path!: string;

  @Column({ type: 'int', default: 0 })
  depth!: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  city!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  country!: string | null;

  @Column({ type: 'double precision', nullable: true })
  latitude!: number | null;

  @Column({ type: 'double precision', nullable: true })
  longitude!: number | null;

  @Column({ name: 'contact_phone', type: 'varchar', length: 32, nullable: true })
  contactPhone!: string | null;

  @Column({ name: 'contact_email', type: 'varchar', length: 160, nullable: true })
  contactEmail!: string | null;

  /** Zones pilotes, agences disposant de leur propre portefeuille, etc. */
  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  metadata!: Record<string, unknown>;
}
