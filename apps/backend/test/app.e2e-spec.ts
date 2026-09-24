import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { setupSwagger } from './../src/swagger.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    process.env.JWT_ACCESS_SECRET = 'test-only-access-secret';
    process.env.JWT_ACCESS_EXPIRES_IN = '15m';
    process.env.SWAGGER_ENABLED = 'true';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    setupSwagger(app, moduleFixture.get(ConfigService));
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1')
      .expect(200)
      .expect('Hello World!');
  });

  it('/api/v1/docs-json (GET)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/docs-json')
      .expect(200);

    expect(response.body.info).toMatchObject({
      title: 'GoBookNow API',
      version: '1.0',
    });
    expect(response.body.components.securitySchemes).toHaveProperty(
      'access-token',
    );
    expect(response.body.components.securitySchemes).toHaveProperty(
      'refresh-cookie',
    );
    expect(response.body.paths).toHaveProperty('/api/v1/auth/login');
    expect(response.body.paths).toHaveProperty('/api/v1/auth/refresh');
  });

  afterEach(async () => {
    await app.close();
  });
});
