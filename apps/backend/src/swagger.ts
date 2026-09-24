import type { INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export const SWAGGER_ACCESS_TOKEN_SECURITY = 'access-token';
export const SWAGGER_REFRESH_COOKIE_SECURITY = 'refresh-cookie';

export function setupSwagger(
  app: INestApplication,
  configService: ConfigService,
): boolean {
  if (!isSwaggerEnabled(configService)) {
    return false;
  }

  const refreshCookieName =
    configService.get<string>('AUTH_REFRESH_COOKIE_NAME') ??
    'gobook_refresh_token';
  const config = new DocumentBuilder()
    .setTitle('GoBookNow API')
    .setDescription(
      'GoBookNow backend API. Access tokens use Bearer JWT authentication; refresh sessions use an HttpOnly cookie.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT access token returned by register, login, or refresh',
      },
      SWAGGER_ACCESS_TOKEN_SECURITY,
    )
    .addCookieAuth(
      refreshCookieName,
      {
        type: 'apiKey',
        in: 'cookie',
        description: 'Opaque refresh token managed as an HttpOnly cookie',
      },
      SWAGGER_REFRESH_COOKIE_SECURITY,
    )
    .addTag('Authentication', 'Register, login, refresh, logout, and identity')
    .addTag('Health', 'Service and database health')
    .addTag('General', 'General API endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    useGlobalPrefix: true,
    jsonDocumentUrl: 'docs-json',
    customSiteTitle: 'GoBookNow API Docs',
    swaggerOptions: {
      persistAuthorization: true,
      withCredentials: true,
    },
  });

  return true;
}

function isSwaggerEnabled(configService: ConfigService): boolean {
  const configuredValue = configService.get<string>('SWAGGER_ENABLED');
  if (configuredValue === undefined) {
    return configService.get<string>('NODE_ENV') !== 'production';
  }

  const normalized = configuredValue.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error('SWAGGER_ENABLED must be true or false');
}
