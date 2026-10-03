import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { buildPaginatedResult } from '@common/dto/pagination.dto';
import { AuditAction } from '@common/enums/user.enum';
import { AuditLog } from '@database/entities/audit-log.entity';
import { QueryAuditLogsDto } from '@modules/audit/dto/query-audit-logs.dto';

export interface WriteAuditLogInput {
  action: AuditAction;
  actorUserId?: string | null;
  actorLabel?: string | null;
  organizationId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  httpMethod?: string | null;
  httpPath?: string | null;
  httpStatus?: number | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepository: Repository<AuditLog>,
  ) {}

  /** Consultation du journal (back-office conformite). */
  async findAll(query: QueryAuditLogsDto) {
    const builder = this.auditRepository.createQueryBuilder('audit');

    if (query.action) builder.andWhere('audit.action = :action', { action: query.action });
    if (query.entityType) builder.andWhere('audit.entityType = :entityType', { entityType: query.entityType });
    if (query.entityId) builder.andWhere('audit.entityId = :entityId', { entityId: query.entityId });
    if (query.actorUserId) builder.andWhere('audit.actorUserId = :actorUserId', { actorUserId: query.actorUserId });
    if (query.from) builder.andWhere('audit.createdAt >= :from', { from: new Date(query.from) });
    if (query.to) builder.andWhere('audit.createdAt <= :to', { to: new Date(query.to) });
    if (query.search) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where('audit.actorLabel ILIKE :search', { search: `%${query.search}%` })
            .orWhere('audit.httpPath ILIKE :search', { search: `%${query.search}%` })
            .orWhere('audit.entityId ILIKE :search', { search: `%${query.search}%` });
        }),
      );
    }

    builder
      .orderBy('audit.createdAt', query.order.toUpperCase() as 'ASC' | 'DESC')
      .skip(query.skip)
      .take(query.limit);

    const [items, total] = await builder.getManyAndCount();
    return buildPaginatedResult(items, total, query.page, query.limit);
  }

  /**
   * Ecrit une entree d'audit. Ne leve jamais d'erreur : une defaillance de
   * journalisation ne doit pas casser l'operation metier.
   */
  async write(input: WriteAuditLogInput): Promise<void> {
    try {
      const entry = this.auditRepository.create({
        action: input.action,
        actorUserId: input.actorUserId ?? null,
        actorLabel: input.actorLabel ?? null,
        organizationId: input.organizationId ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        httpMethod: input.httpMethod ?? null,
        httpPath: input.httpPath ?? null,
        httpStatus: input.httpStatus ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        beforeState: input.beforeState ?? null,
        afterState: input.afterState ?? null,
        metadata: input.metadata ?? {},
      });
      await this.auditRepository.save(entry);
    } catch {
      // ignore : la journalisation est best-effort
    }
  }
}
