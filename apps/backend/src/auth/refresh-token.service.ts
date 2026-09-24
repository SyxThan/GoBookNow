import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions } from 'express';
import { PrismaService } from '../database/prisma/prisma.service.js';
import {
  RefreshTokenRevokedReason,
  UserStatus,
} from '../generated/prisma/client.js';
import {
  authRelations,
  type UserWithAuthRelations,
} from './auth-user.query.js';

const INVALID_REFRESH_TOKEN_MESSAGE = 'Invalid refresh token';
const REFRESH_TOKEN_BYTES = 64;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const COOKIE_PATH = '/api/v1/auth';

export type SessionMetadata = {
  userAgent: string | null;
  ipAddress: string | null;
};

type IssuedToken = {
  rawToken: string;
  tokenHash: string;
};

export type RotatedRefreshToken = {
  rawToken: string;
  user: UserWithAuthRelations;
};

@Injectable()
export class RefreshTokenService {
  readonly cookieName: string;
  readonly cookieOptions: CookieOptions;

  private readonly tokenTtlMilliseconds: number;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    const ttlDays = this.parsePositiveInteger(
      configService.get<string>('REFRESH_TOKEN_TTL_DAYS') ?? '7',
      'REFRESH_TOKEN_TTL_DAYS',
    );
    this.tokenTtlMilliseconds = ttlDays * MILLISECONDS_PER_DAY;

    const cookieName =
      configService.get<string>('AUTH_REFRESH_COOKIE_NAME') ??
      'gobook_refresh_token';
    if (cookieName.trim().length === 0) {
      throw new Error('AUTH_REFRESH_COOKIE_NAME must not be empty');
    }
    this.cookieName = cookieName;

    const secure = this.parseBoolean(
      configService.get<string>('AUTH_COOKIE_SECURE') ?? 'false',
      'AUTH_COOKIE_SECURE',
    );
    const sameSite = this.parseSameSite(
      configService.get<string>('AUTH_COOKIE_SAME_SITE') ?? 'lax',
    );
    if (sameSite === 'none' && !secure) {
      throw new Error(
        'AUTH_COOKIE_SAME_SITE=none requires AUTH_COOKIE_SECURE=true',
      );
    }

    this.cookieOptions = {
      httpOnly: true,
      secure,
      sameSite,
      path: COOKIE_PATH,
      maxAge: this.tokenTtlMilliseconds,
    };
  }

  get clearCookieOptions(): CookieOptions {
    const { maxAge: _maxAge, ...options } = this.cookieOptions;
    return options;
  }

  async createSession(
    userId: string,
    metadata: SessionMetadata,
  ): Promise<string> {
    const token = this.generateToken();

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: token.tokenHash,
        familyId: randomUUID(),
        expiresAt: this.getExpiryDate(),
        ...metadata,
      },
    });

    return token.rawToken;
  }

  async rotate(
    rawToken: string,
    metadata: SessionMetadata,
  ): Promise<RotatedRefreshToken> {
    const tokenHash = this.hashToken(rawToken);
    const nextToken = this.generateToken();
    const nextTokenId = randomUUID();
    const now = new Date();

    const result = await this.prisma.$transaction(async (transaction) => {
      const currentToken = await transaction.refreshToken.findUnique({
        where: { tokenHash },
        include: {
          user: {
            include: authRelations,
          },
        },
      });

      if (
        !currentToken ||
        currentToken.revokedAt !== null ||
        currentToken.expiresAt <= now
      ) {
        return { state: 'invalid' } as const;
      }

      if (
        currentToken.user.status !== UserStatus.ACTIVE ||
        currentToken.user.deletedAt !== null
      ) {
        await transaction.refreshToken.updateMany({
          where: {
            userId: currentToken.userId,
            familyId: currentToken.familyId,
            revokedAt: null,
          },
          data: {
            revokedAt: now,
            revokedReason: RefreshTokenRevokedReason.ACCOUNT_DISABLED,
          },
        });
        return { state: 'inactive' } as const;
      }

      const claimed = await transaction.refreshToken.updateMany({
        where: {
          id: currentToken.id,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: {
          revokedAt: now,
          revokedReason: RefreshTokenRevokedReason.ROTATED,
          replacedByTokenId: nextTokenId,
          lastUsedAt: now,
        },
      });

      if (claimed.count !== 1) {
        return { state: 'invalid' } as const;
      }

      await transaction.refreshToken.create({
        data: {
          id: nextTokenId,
          userId: currentToken.userId,
          tokenHash: nextToken.tokenHash,
          familyId: currentToken.familyId,
          expiresAt: this.getExpiryDate(now),
          ...metadata,
        },
      });

      return {
        state: 'success',
        user: currentToken.user,
      } as const;
    });

    if (result.state === 'inactive') {
      throw new ForbiddenException('Account is not active');
    }
    if (result.state !== 'success') {
      throw new UnauthorizedException(INVALID_REFRESH_TOKEN_MESSAGE);
    }

    return {
      rawToken: nextToken.rawToken,
      user: result.user,
    };
  }

  async revokeSession(rawToken: string): Promise<void> {
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashToken(rawToken) },
      select: {
        userId: true,
        familyId: true,
      },
    });

    if (!token) {
      return;
    }

    await this.prisma.refreshToken.updateMany({
      where: {
        userId: token.userId,
        familyId: token.familyId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        revokedReason: RefreshTokenRevokedReason.LOGOUT,
      },
    });
  }

  private generateToken(): IssuedToken {
    const rawToken = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
    return {
      rawToken,
      tokenHash: this.hashToken(rawToken),
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private getExpiryDate(from = new Date()): Date {
    return new Date(from.getTime() + this.tokenTtlMilliseconds);
  }

  private parsePositiveInteger(value: string, name: string): number {
    if (!/^\d+$/.test(value.trim())) {
      throw new Error(`${name} must be a positive integer`);
    }

    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      throw new Error(`${name} must be a positive integer`);
    }
    return parsed;
  }

  private parseBoolean(value: string, name: string): boolean {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    throw new Error(`${name} must be true or false`);
  }

  private parseSameSite(value: string): 'lax' | 'strict' | 'none' {
    const normalized = value.trim().toLowerCase();
    if (
      normalized === 'lax' ||
      normalized === 'strict' ||
      normalized === 'none'
    ) {
      return normalized;
    }
    throw new Error('AUTH_COOKIE_SAME_SITE must be lax, strict, or none');
  }
}
