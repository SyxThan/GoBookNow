import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AdminTransactionsController } from './admin-transactions.controller.js';
import { AdminTransactionsService } from './admin-transactions.service.js';

@Module({
  imports: [AuthModule],
  controllers: [AdminTransactionsController],
  providers: [AdminTransactionsService],
})
export class AdminTransactionsModule {}
