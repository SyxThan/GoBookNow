import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { VendorOwnershipResolver } from './vendor-ownership.resolver.js';
import { VendorsController } from './vendors.controller.js';
import { VendorsService } from './vendors.service.js';

@Module({
  imports: [AuthModule],
  controllers: [VendorsController],
  providers: [VendorsService, VendorOwnershipResolver],
  exports: [VendorsService, VendorOwnershipResolver],
})
export class VendorsModule {}
