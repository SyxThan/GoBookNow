import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma/prisma.service.js';
import type { AuditAction } from './audit.constants.js';
import type { ListAuditLogsDto } from './dto/list-audit-logs.dto.js';

type AuditClient = Pick<Prisma.TransactionClient, 'auditLog'>;

export type AuditRequestMetadata = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type CreateAuditEvent = AuditRequestMetadata & {
  actorUserId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId: string;
  targetUserId?: string | null;
  metadata?: Prisma.InputJsonValue;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  create(event: CreateAuditEvent, client: AuditClient = this.prisma) {
    return client.auditLog.create({
      data: {
        actorUserId: event.actorUserId ?? null,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        targetUserId: event.targetUserId ?? null,
        metadata: event.metadata,
        ipAddress: event.ipAddress?.slice(0, 64) ?? null,
        userAgent: event.userAgent?.slice(0, 500) ?? null,
      },
      select: { id: true },
    });
  }

  async list(query: ListAuditLogsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (from && to && from > to) {
      throw new BadRequestException('from must be before or equal to to');
    }

    const where: Prisma.AuditLogWhereInput = {
      action: query.action,
      entityType: query.entityType,
      entityId: query.entityId,
      actorUserId: query.actorUserId,
      createdAt: from || to ? { gte: from, lte: to } : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          targetUserId: true,
          metadata: true,
          ipAddress: true,
          userAgent: true,
          createdAt: true,
          actor: {
            select: {
              id: true,
              email: true,
              profile: { select: { fullName: true } },
            },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }
}
