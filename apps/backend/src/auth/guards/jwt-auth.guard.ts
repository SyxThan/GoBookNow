import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { AuthService } from '../auth.service.js';
import type { CurrentUser, JwtPayload } from '../types/jwt-payload.type.js';

type AuthenticatedRequest = Request & { user: CurrentUser };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request);

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    if (
      payload.type !== 'access' ||
      typeof payload.sub !== 'string' ||
      !Array.isArray(payload.roles) ||
      !payload.roles.every((role) => typeof role === 'string')
    ) {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    request.user = await this.authService.getCurrentUser(payload.sub);
    return true;
  }

  private extractBearerToken(request: Request): string {
    const authorization = request.headers.authorization;
    const match = authorization?.match(/^Bearer\s+([^\s]+)$/i);

    if (!match?.[1]) {
      throw new UnauthorizedException('Bearer access token is required');
    }

    return match[1];
  }
}
