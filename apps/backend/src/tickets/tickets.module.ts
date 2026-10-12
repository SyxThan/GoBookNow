import { Module } from '@nestjs/common';
import { TicketService } from './ticket.service.js';
import { TicketTokenService } from './ticket-token.service.js';

@Module({
  providers: [TicketService, TicketTokenService],
  exports: [TicketService, TicketTokenService],
})
export class TicketsModule {}
