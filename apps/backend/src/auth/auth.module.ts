import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { PrismaModule } from '../database/prisma/prisma.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RefreshTokenService } from './refresh-token.service.js';
import { OwnershipService } from './authorization/ownership.service.js';
import { OwnershipGuard } from './guards/ownership.guard.js';
import { RolesGuard } from './guards/roles.guard.js';

function parseAccessTokenLifetime(value: string): number {
  const match = value
    .trim()
    .toLowerCase()
    .match(/^(\d+)([smhd])?$/);
  if (!match?.[1]) {
    throw new Error(
      'JWT_ACCESS_EXPIRES_IN must be a positive number followed by s, m, h, or d',
    );
  }

  const amount = Number(match[1]);
  const unit = match[2] ?? 's';
  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 24 * 60 * 60,
  };
  const seconds = amount * multipliers[unit];

  if (!Number.isSafeInteger(seconds) || seconds <= 0) {
    throw new Error('JWT_ACCESS_EXPIRES_IN must resolve to positive seconds');
  }

  return seconds;
}

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService): JwtModuleOptions => {
        const secret = configService.getOrThrow<string>('JWT_ACCESS_SECRET');
        if (secret.trim().length === 0) {
          throw new Error('JWT_ACCESS_SECRET must not be empty');
        }

        const expiresIn = parseAccessTokenLifetime(
          configService.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m',
        );

        return {
          secret,
          signOptions: { expiresIn },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    RefreshTokenService,
    JwtAuthGuard,
    RolesGuard,
    OwnershipGuard,
    OwnershipService,
  ],
  exports: [
    AuthService,
    JwtAuthGuard,
    RolesGuard,
    OwnershipGuard,
    OwnershipService,
  ],
})
export class AuthModule {}
