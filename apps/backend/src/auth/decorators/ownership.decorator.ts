import { SetMetadata } from '@nestjs/common';
import type { OwnershipPolicy } from '../types/ownership-policy.type.js';

export const OWNERSHIP_KEY = 'auth:ownership';

export const RequireOwnership = (
  policy: OwnershipPolicy,
): MethodDecorator & ClassDecorator => SetMetadata(OWNERSHIP_KEY, policy);
