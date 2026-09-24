import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { CurrentUserDecorator } from './decorators/current-user.decorator.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import {
  RefreshTokenService,
  type SessionMetadata,
} from './refresh-token.service.js';
import type { CurrentUser } from './types/jwt-payload.type.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly refreshTokenService: RefreshTokenService,
  ) {}

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.register(
      dto,
      this.getSessionMetadata(request),
    );
    this.setRefreshCookie(response, result.refreshToken);
    return result.body;
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(
      dto,
      this.getSessionMetadata(request),
    );
    this.setRefreshCookie(response, result.refreshToken);
    return result.body;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const rawToken = this.getRefreshCookie(request);
    if (!rawToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const result = await this.authService.refresh(
      rawToken,
      this.getSessionMetadata(request),
    );
    this.setRefreshCookie(response, result.refreshToken);
    return result.body;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.logout(this.getRefreshCookie(request));
    response.clearCookie(
      this.refreshTokenService.cookieName,
      this.refreshTokenService.clearCookieOptions,
    );
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUserDecorator() user: CurrentUser): CurrentUser {
    return user;
  }

  private setRefreshCookie(response: Response, rawToken: string): void {
    response.cookie(
      this.refreshTokenService.cookieName,
      rawToken,
      this.refreshTokenService.cookieOptions,
    );
  }

  private getRefreshCookie(request: Request): string | undefined {
    const cookies = request.cookies as Record<string, unknown> | undefined;
    const token = cookies?.[this.refreshTokenService.cookieName];
    return typeof token === 'string' && token.length > 0 ? token : undefined;
  }

  private getSessionMetadata(request: Request): SessionMetadata {
    return {
      userAgent: request.get('user-agent')?.slice(0, 500) ?? null,
      ipAddress: request.ip?.slice(0, 64) ?? null,
    };
  }
}
