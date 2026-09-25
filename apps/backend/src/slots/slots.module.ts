import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PricingModule } from '../pricing/pricing.module.js';
import { ServicesModule } from '../services/services.module.js';
import { SlotOwnershipResolver } from './slot-ownership.resolver.js';
import {
  PublicSlotsController,
  VendorSlotsController,
} from './slots.controller.js';
import { SlotsService } from './slots.service.js';

@Module({
  imports: [AuthModule, ServicesModule, PricingModule],
  controllers: [VendorSlotsController, PublicSlotsController],
  providers: [SlotsService, SlotOwnershipResolver],
  exports: [SlotsService, SlotOwnershipResolver],
})
export class SlotsModule {}
