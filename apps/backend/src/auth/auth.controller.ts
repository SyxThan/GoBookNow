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
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  SWAGGER_ACCESS_TOKEN_SECURITY,
  SWAGGER_REFRESH_COOKIE_SECURITY,
} from '../swagger.js';
import { AuthService } from './auth.service.js';
import { CurrentUserDecorator } from './decorators/current-user.decorator.js';
import {
  AccessTokenResponseDto,
  AuthResponseDto,
  CurrentUserResponseDto,
} from './dto/auth-response.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import {
  RefreshTokenService,
  type SessionMetadata,
} from './refresh-token.service.js';
import type { CurrentUser } from './types/jwt-payload.type.js';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly refreshTokenService: RefreshTokenService,
  ) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a customer account and create a session' })
  @ApiCreatedResponse({
    type: AuthResponseDto,
    description: 'Account created; refresh token is set as an HttpOnly cookie',
  })
  @ApiBadRequestResponse({ description: 'Invalid registration data' })
  @ApiConflictResponse({ description: 'Email address is already registered' })
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
  @ApiOperation({ summary: 'Authenticate and create a new session' })
  @ApiOkResponse({
    type: AuthResponseDto,
    description: 'Authenticated; refresh token is set as an HttpOnly cookie',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password' })
  @ApiForbiddenResponse({ description: 'Account is not active' })
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
  @ApiCookieAuth(SWAGGER_REFRESH_COOKIE_SECURITY)
  @ApiOperation({
    summary: 'Rotate the refresh token and issue a new access token',
  })
  @ApiOkResponse({
    type: AccessTokenResponseDto,
    description:
      'Token rotated; the replacement refresh token is set as a cookie',
  })
  @ApiUnauthorizedResponse({
    description: 'Refresh token is missing or invalid',
  })
  @ApiForbiddenResponse({ description: 'Account is not active' })
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
  @ApiCookieAuth(SWAGGER_REFRESH_COOKIE_SECURITY)
  @ApiOperation({ summary: 'Revoke the current session and clear its cookie' })
  @ApiNoContentResponse({ description: 'Current session logged out' })
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
  @ApiBearerAuth(SWAGGER_ACCESS_TOKEN_SECURITY)
  @ApiOperation({ summary: 'Get the authenticated user' })
  @ApiOkResponse({ type: CurrentUserResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Access token is missing or invalid',
  })
  @ApiForbiddenResponse({ description: 'Account is not active' })
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
