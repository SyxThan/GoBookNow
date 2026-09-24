import { Injectable } from '@nestjs/common';
import { RoleCode } from '../constants/role.constants.js';
import type { AuthenticatedUser } from '../types/authenticated-user.type.js';

@Injectable()
export class OwnershipService {
  isSelf(authenticatedUserId: string, ownerUserId: string): boolean {
    return authenticatedUserId === ownerUserId;
  }

  canBypass(user: AuthenticatedUser, adminBypass = false): boolean {
    return adminBypass && user.roles.includes(RoleCode.ADMIN);
  }

  canAccess(
    user: AuthenticatedUser,
    ownerUserId: string,
    adminBypass = false,
  ): boolean {
    if (this.canBypass(user, adminBypass)) {
      return true;
    }

    return this.isSelf(user.id, ownerUserId);
  }
}
