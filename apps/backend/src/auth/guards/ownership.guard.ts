import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { OwnershipService } from '../authorization/ownership.service.js';
import { OWNERSHIP_KEY } from '../decorators/ownership.decorator.js';
import type { AuthenticatedUser } from '../types/authenticated-user.type.js';
import type {
  OwnershipPolicy,
  ResourceOwnershipPolicy,
  ResourceOwnershipResolver,
} from '../types/ownership-policy.type.js';

type AuthenticatedRequest = Request & {
  user?: AuthenticatedUser;
  params: Record<string, string | undefined>;
};

@Injectable()
export class OwnershipGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly moduleRef: ModuleRef,
    private readonly ownershipService: OwnershipService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.getAllAndOverride<OwnershipPolicy>(
      OWNERSHIP_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!policy) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException('Authentication is required');
    }

    if (this.ownershipService.canBypass(user, policy.adminBypass)) {
      return true;
    }

    const resourceId = request.params[policy.param];
    if (!resourceId) {
      throw new ForbiddenException('Resource ownership could not be verified');
    }

    const ownerUserId =
      policy.type === 'SELF'
        ? resourceId
        : await this.resolveResourceOwner(policy.resolver, resourceId);

    if (
      !this.ownershipService.canAccess(user, ownerUserId, policy.adminBypass)
    ) {
      throw new ForbiddenException('Resource ownership is required');
    }

    return true;
  }

  private async resolveResourceOwner(
    resolverType: ResourceOwnershipPolicy['resolver'],
    resourceId: string,
  ): Promise<string> {
    const resolver = this.moduleRef.get<ResourceOwnershipResolver>(
      resolverType,
      {
        strict: false,
      },
    );
    const ownerUserId = await resolver.resolveOwnerUserId(resourceId);
    if (!ownerUserId) {
      throw new NotFoundException('Resource not found');
    }

    return ownerUserId;
  }
}
