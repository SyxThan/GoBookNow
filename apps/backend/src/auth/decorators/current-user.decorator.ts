import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { CurrentUser } from '../types/jwt-payload.type.js';

type AuthenticatedRequest = Request & { user: CurrentUser };

export const CurrentUserDecorator = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CurrentUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user;
  },
);
