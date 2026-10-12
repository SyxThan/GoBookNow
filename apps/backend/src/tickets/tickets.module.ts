import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { TicketQrService } from './ticket-qr.service.js';
import { TicketService } from './ticket.service.js';
import { TicketTokenService } from './ticket-token.service.js';
import { TicketValidationService } from './ticket-validation.service.js';
import { TicketsController } from './tickets.controller.js';
import { VendorTicketsController } from './vendor-tickets.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [TicketsController, VendorTicketsController],
  providers: [
    TicketService,
    TicketTokenService,
    TicketQrService,
    TicketValidationService,
  ],
  exports: [
    TicketService,
    TicketTokenService,
    TicketQrService,
    TicketValidationService,
  ],
})
export class TicketsModule {}
