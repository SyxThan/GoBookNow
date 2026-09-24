import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { VendorsModule } from '../vendors/vendors.module.js';
import {
  FileStorageService,
  LocalFileStorageService,
} from './file-storage.service.js';
import { VendorApplicationOwnershipResolver } from './vendor-application-ownership.resolver.js';
import {
  AdminVendorApplicationsController,
  VendorApplicationsController,
  VendorApplicationSubmissionController,
} from './vendor-applications.controller.js';
import { VendorApplicationsService } from './vendor-applications.service.js';

@Module({
  imports: [AuthModule, VendorsModule],
  controllers: [
    VendorApplicationSubmissionController,
    VendorApplicationsController,
    AdminVendorApplicationsController,
  ],
  providers: [
    VendorApplicationsService,
    VendorApplicationOwnershipResolver,
    { provide: FileStorageService, useClass: LocalFileStorageService },
  ],
  exports: [VendorApplicationsService, VendorApplicationOwnershipResolver],
})
export class VendorApplicationsModule {}
