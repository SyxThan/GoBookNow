import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { ServiceImagesController } from './images/service-images.controller.js';
import { ServiceImagesService } from './images/service-images.service.js';
import { ServiceOwnershipResolver } from './service-ownership.resolver.js';
import {
  PublicServicesController,
  VendorServicesController,
} from './services.controller.js';
import { ServicesService } from './services.service.js';

@Module({
  imports: [AuthModule, StorageModule],
  controllers: [
    PublicServicesController,
    VendorServicesController,
    ServiceImagesController,
  ],
  providers: [ServicesService, ServiceImagesService, ServiceOwnershipResolver],
  exports: [ServicesService, ServiceOwnershipResolver],
})
export class ServicesModule {}
