import './instrument.js';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { setupSwagger } from './swagger.js';
import { configureHttp } from './security/configure-http.js';
import { logger } from './observability/logger.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    logger,
  });
  const configService = app.get(ConfigService);
  configureHttp(app);
  app.enableShutdownHooks();
  const port = process.env.PORT ?? 3001;
  setupSwagger(app, configService);

  await app.listen(port);

  logger.emit('info', 'application.ready');
}
await bootstrap();
