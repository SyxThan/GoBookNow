import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { Prisma, UserStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma/prisma.service.js';
import {
  authRelations,
  type UserWithAuthRelations,
} from './auth-user.query.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';
import {
  RefreshTokenService,
  type SessionMetadata,
} from './refresh-token.service.js';
import { RoleCode } from './constants/role.constants.js';
import type { CurrentUser, JwtPayload } from './types/jwt-payload.type.js';

const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password';
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,p=1,t=2$F4goD8chtrO0g1W7n3MDjQ$c7vjWtufCjGMJLKuspXWlgMa+20VluYfR+hlNVb7bp8';
const ARGON2_OPTIONS: argon2.HashOptions & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export type AccessTokenResponse = {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
};

export type AuthResponse = AccessTokenResponse & {
  user: {
    id: string;
    email: string;
    fullName: string | null;
    roles: string[];
  };
};

export type AuthSessionResult = {
  body: AuthResponse;
  refreshToken: string;
};

export type RefreshSessionResult = {
  body: AccessTokenResponse;
  refreshToken: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
  ) {}

  async register(
    dto: RegisterDto,
    metadata: SessionMetadata,
  ): Promise<AuthSessionResult> {
    const email = this.normalizeEmail(dto.email);
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException('An account with this email already exists');
    }

    const customerRole = await this.prisma.role.findUnique({
      where: { code: RoleCode.CUSTOMER },
      select: { id: true },
    });

    if (!customerRole) {
      throw new InternalServerErrorException(
        'CUSTOMER role is not configured; run the role seed',
      );
    }

    const passwordHash = await argon2.hash(dto.password, ARGON2_OPTIONS);

    let user: UserWithAuthRelations;
    try {
      user = await this.prisma.user.create({
        data: {
          email,
          passwordHash,
          profile: {
            create: {
              fullName: dto.fullName.trim(),
              phone: dto.phone?.trim(),
            },
          },
          userRoles: {
            create: {
              roleId: customerRole.id,
            },
          },
        },
        include: authRelations,
      });
    } catch (error: unknown) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(
          'An account with this email already exists',
        );
      }
      throw error;
    }

    const [body, refreshToken] = await Promise.all([
      this.createAuthResponse(user),
      this.refreshTokenService.createSession(user.id, metadata),
    ]);

    return { body, refreshToken };
  }

  async login(
    dto: LoginDto,
    metadata: SessionMetadata,
  ): Promise<AuthSessionResult> {
    const email = this.normalizeEmail(dto.email);
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: authRelations,
    });

    const passwordMatches = user?.passwordHash
      ? await argon2.verify(user.passwordHash, dto.password)
      : await this.verifyDummyPassword(dto.password);

    if (!user || !passwordMatches) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    if (user.status !== UserStatus.ACTIVE || user.deletedAt !== null) {
      throw new ForbiddenException('Account is not active');
    }

    const [body, refreshToken] = await Promise.all([
      this.createAuthResponse(user),
      this.refreshTokenService.createSession(user.id, metadata),
    ]);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return { body, refreshToken };
  }

  async refresh(
    rawToken: string,
    metadata: SessionMetadata,
  ): Promise<RefreshSessionResult> {
    const rotated = await this.refreshTokenService.rotate(rawToken, metadata);
    return {
      body: await this.createAccessTokenResponse(rotated.user),
      refreshToken: rotated.rawToken,
    };
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (rawToken) {
      await this.refreshTokenService.revokeSession(rawToken);
    }
  }

  async getCurrentUser(userId: string): Promise<CurrentUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: authRelations,
    });

    if (!user || user.deletedAt !== null) {
      throw new UnauthorizedException('Authenticated user no longer exists');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Account is not active');
    }

    return {
      id: user.id,
      email: user.email,
      profile: user.profile
        ? {
            fullName: user.profile.fullName,
            phone: user.profile.phone,
            avatarUrl: user.profile.avatarUrl,
            locale: user.profile.locale,
            timezone: user.profile.timezone,
          }
        : null,
      roles: this.getRoleCodes(user),
    };
  }

  private async createAuthResponse(
    user: UserWithAuthRelations,
  ): Promise<AuthResponse> {
    const token = await this.createAccessTokenResponse(user);
    const roles = this.getRoleCodes(user);

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.profile?.fullName ?? null,
        roles,
      },
      ...token,
    };
  }

  private async createAccessTokenResponse(
    user: UserWithAuthRelations,
  ): Promise<AccessTokenResponse> {
    const roles = this.getRoleCodes(user);
    const payload: JwtPayload = {
      sub: user.id,
      roles,
      type: 'access',
    };
    const accessToken = await this.jwtService.signAsync(payload, {
      jwtid: randomUUID(),
    });
    const decoded = this.jwtService.decode<
      JwtPayload & {
        iat: number;
        exp: number;
      }
    >(accessToken);

    if (!decoded?.iat || !decoded.exp) {
      throw new InternalServerErrorException('Failed to create access token');
    }

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: decoded.exp - decoded.iat,
    };
  }

  private getRoleCodes(user: UserWithAuthRelations): string[] {
    return user.userRoles.map(({ role }) => role.code);
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private async verifyDummyPassword(password: string): Promise<false> {
    await argon2.verify(DUMMY_PASSWORD_HASH, password);
    return false;
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
