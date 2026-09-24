import { RoleCode } from '../constants/role.constants.js';
import {
  OWNERSHIP_KEY,
  RequireOwnership,
} from '../decorators/ownership.decorator.js';
import type { OwnershipPolicy } from '../types/ownership-policy.type.js';
import { OwnershipService } from './ownership.service.js';

describe('OwnershipService', () => {
  const service = new OwnershipService();

  it('allows the authenticated resource owner', () => {
    expect(
      service.canAccess({ id: 'user-1', roles: [RoleCode.CUSTOMER] }, 'user-1'),
    ).toBe(true);
  });

  it('denies a different owner', () => {
    expect(
      service.canAccess({ id: 'user-1', roles: [RoleCode.VENDOR] }, 'user-2'),
    ).toBe(false);
  });

  it('allows ADMIN only when bypass is explicitly enabled', () => {
    const admin = { id: 'admin-1', roles: [RoleCode.ADMIN] };

    expect(service.canAccess(admin, 'user-1', true)).toBe(true);
    expect(service.canAccess(admin, 'user-1', false)).toBe(false);
  });
});

describe('@RequireOwnership', () => {
  it('stores self ownership and explicit admin bypass metadata', () => {
    class TestController {
      @RequireOwnership({
        type: 'SELF',
        param: 'userId',
        adminBypass: true,
      })
      endpoint(this: void): void {}
    }

    const metadata = Reflect.getMetadata(
      OWNERSHIP_KEY,
      TestController.prototype.endpoint,
    ) as OwnershipPolicy;

    expect(metadata).toEqual({
      type: 'SELF',
      param: 'userId',
      adminBypass: true,
    });
  });
});
