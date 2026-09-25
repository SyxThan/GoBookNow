import { Injectable } from '@nestjs/common';
import type { ResourceOwnershipResolver } from '../auth/types/ownership-policy.type.js';
import { PrismaService } from '../database/prisma/prisma.service.js';

@Injectable()
export class ServiceOwnershipResolver implements ResourceOwnershipResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolveOwnerUserId(serviceId: string): Promise<string | null> {
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, deletedAt: null },
      select: { vendor: { select: { ownerUserId: true } } },
    });
    return service?.vendor.ownerUserId ?? null;
  }
}
