import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  RoleCode,
  type RoleCode as Role,
} from '../constants/role.constants.js';
import { ROLES_KEY, Roles } from '../decorators/roles.decorator.js';
import type { AuthenticatedUser } from '../types/authenticated-user.type.js';
import { RolesGuard } from './roles.guard.js';

function createContext(user?: AuthenticatedUser): ExecutionContext {
  return {
    getHandler: () => createContext,
    getClass: () => RolesGuard,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function createGuard(requiredRoles?: Role[]): RolesGuard {
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(requiredRoles),
  } as unknown as Reflector;
  return new RolesGuard(reflector);
}

describe('RolesGuard', () => {
  it('allows an authenticated route with no role metadata', () => {
    expect(
      createGuard().canActivate(
        createContext({ id: 'user-1', roles: [RoleCode.CUSTOMER] }),
      ),
    ).toBe(true);
  });

  it.each([
    [[RoleCode.CUSTOMER], [RoleCode.CUSTOMER]],
    [[RoleCode.CUSTOMER], [RoleCode.CUSTOMER, RoleCode.VENDOR]],
    [[RoleCode.VENDOR], [RoleCode.CUSTOMER, RoleCode.VENDOR]],
    [[RoleCode.ADMIN], [RoleCode.ADMIN]],
    [[RoleCode.CUSTOMER, RoleCode.ADMIN], [RoleCode.ADMIN]],
  ] satisfies Array<[Role[], Role[]]>)(
    'allows %j for user roles %j',
    (required, roles) => {
      expect(
        createGuard(required).canActivate(
          createContext({ id: 'user-1', roles }),
        ),
      ).toBe(true);
    },
  );

  it.each([
    [[RoleCode.CUSTOMER], [RoleCode.VENDOR]],
    [[RoleCode.VENDOR], [RoleCode.CUSTOMER]],
    [[RoleCode.ADMIN], [RoleCode.CUSTOMER]],
  ] satisfies Array<[Role[], Role[]]>)(
    'denies %j for user roles %j',
    (required, roles) => {
      expect(() =>
        createGuard(required).canActivate(
          createContext({ id: 'user-1', roles }),
        ),
      ).toThrow(ForbiddenException);
    },
  );

  it('returns 401 when role metadata exists but authentication is missing', () => {
    expect(() =>
      createGuard([RoleCode.CUSTOMER]).canActivate(createContext()),
    ).toThrow(UnauthorizedException);
  });
});

describe('@Roles', () => {
  it('stores all allowed role codes as method metadata', () => {
    class TestController {
      @Roles(RoleCode.CUSTOMER, RoleCode.ADMIN)
      endpoint(this: void): void {}
    }

    const metadata = Reflect.getMetadata(
      ROLES_KEY,
      TestController.prototype.endpoint,
    ) as Role[];

    expect(metadata).toEqual([RoleCode.CUSTOMER, RoleCode.ADMIN]);
  });
});
