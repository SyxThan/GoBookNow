import { Injectable } from '@nestjs/common';
import type { ResourceOwnershipResolver } from '../auth/types/ownership-policy.type.js';
import { PrismaService } from '../database/prisma/prisma.service.js';

@Injectable()
export class VendorApplicationOwnershipResolver implements ResourceOwnershipResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolveOwnerUserId(applicationId: string): Promise<string | null> {
    const application = await this.prisma.vendorApplication.findFirst({
      where: { id: applicationId, vendor: { deletedAt: null } },
      select: { vendor: { select: { ownerUserId: true } } },
    });
    return application?.vendor.ownerUserId ?? null;
  }
}
