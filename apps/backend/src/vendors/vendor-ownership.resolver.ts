import { Injectable } from '@nestjs/common';
import type { ResourceOwnershipResolver } from '../auth/types/ownership-policy.type.js';
import { PrismaService } from '../database/prisma/prisma.service.js';

@Injectable()
export class VendorOwnershipResolver implements ResourceOwnershipResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolveOwnerUserId(vendorId: string): Promise<string | null> {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id: vendorId, deletedAt: null },
      select: { ownerUserId: true },
    });

    return vendor?.ownerUserId ?? null;
  }
}
