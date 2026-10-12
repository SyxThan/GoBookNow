import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { TicketQrService } from './ticket-qr.service.js';
import { TicketService } from './ticket.service.js';
import { TicketTokenService } from './ticket-token.service.js';
import { TicketsController } from './tickets.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [TicketsController],
  providers: [TicketService, TicketTokenService, TicketQrService],
  exports: [TicketService, TicketTokenService, TicketQrService],
})
export class TicketsModule {}
