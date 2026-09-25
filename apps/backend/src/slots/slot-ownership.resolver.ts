import { Injectable } from '@nestjs/common';
import type { ResourceOwnershipResolver } from '../auth/types/ownership-policy.type.js';
import { PrismaService } from '../database/prisma/prisma.service.js';

@Injectable()
export class SlotOwnershipResolver implements ResourceOwnershipResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolveOwnerUserId(slotId: string): Promise<string | null> {
    const slot = await this.prisma.slot.findFirst({
      where: { id: slotId, deletedAt: null },
      select: {
        service: { select: { vendor: { select: { ownerUserId: true } } } },
      },
    });
    return slot?.service.vendor.ownerUserId ?? null;
  }
}
