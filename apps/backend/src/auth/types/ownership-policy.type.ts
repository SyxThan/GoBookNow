import type { Type } from '@nestjs/common';

export interface ResourceOwnershipResolver {
  resolveOwnerUserId(resourceId: string): Promise<string | null>;
}

type OwnershipPolicyBase = {
  /** The route parameter containing either the user ID or resource ID. */
  param: string;
  /** ADMIN bypass is opt-in for each route. */
  adminBypass?: boolean;
};

export type SelfOwnershipPolicy = OwnershipPolicyBase & {
  type: 'SELF';
};

export type ResourceOwnershipPolicy = OwnershipPolicyBase & {
  type: 'RESOURCE';
  /** Injectable resolver that obtains the real owner from trusted storage. */
  resolver: Type<ResourceOwnershipResolver>;
};

export type OwnershipPolicy = SelfOwnershipPolicy | ResourceOwnershipPolicy;
