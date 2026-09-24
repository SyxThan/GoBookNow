import { SetMetadata } from '@nestjs/common';
import type { RoleCode } from '../constants/role.constants.js';

export const ROLES_KEY = 'auth:roles';

/** Grants access when the authenticated user has at least one required role. */
export const Roles = (...roles: RoleCode[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
