import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ServiceOwnershipResolver } from './service-ownership.resolver.js';
import {
  PublicServicesController,
  VendorServicesController,
} from './services.controller.js';
import { ServicesService } from './services.service.js';

@Module({
  imports: [AuthModule],
  controllers: [PublicServicesController, VendorServicesController],
  providers: [ServicesService, ServiceOwnershipResolver],
  exports: [ServicesService, ServiceOwnershipResolver],
})
export class ServicesModule {}
