import { Module } from '@nestjs/common';
import { RefundService } from './refund.service.js';

@Module({
  providers: [RefundService],
  exports: [RefundService],
})
export class RefundsModule {}
