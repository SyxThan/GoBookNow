import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RateLimitStore } from './rate-limit.js';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [RateLimitStore],
  exports: [RateLimitStore],
})
export class HttpPlatformModule {}
