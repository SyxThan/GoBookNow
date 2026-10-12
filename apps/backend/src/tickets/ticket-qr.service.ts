import { Injectable, InternalServerErrorException } from '@nestjs/common';
import QRCode from 'qrcode';
import type { Ticket } from '../generated/prisma/client.js';
import { TicketTokenService } from './ticket-token.service.js';

const MAX_QR_PAYLOAD_BYTES = 512;

@Injectable()
export class TicketQrService {
  constructor(private readonly ticketTokens: TicketTokenService) {}

  async generatePng(
    ticket: Pick<Ticket, 'id' | 'tokenNonce' | 'tokenVersion'>,
  ): Promise<Buffer> {
    const credential = this.ticketTokens.generateToken(ticket);
    if (Buffer.byteLength(credential, 'utf8') > MAX_QR_PAYLOAD_BYTES) {
      throw new InternalServerErrorException(
        'Ticket credential cannot be rendered as QR',
      );
    }

    try {
      return await QRCode.toBuffer(credential, {
        type: 'png',
        errorCorrectionLevel: 'Q',
        margin: 2,
        width: 512,
      });
    } catch {
      throw new InternalServerErrorException('Could not generate Ticket QR');
    }
  }
}
