import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Ticket } from '../generated/prisma/client.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma/prisma.service.js';

const CURRENT_TOKEN_VERSION = 1;
const MAX_TOKEN_LENGTH = 512;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NONCE_PATTERN = /^[A-Za-z0-9_-]{22,64}$/;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

@Injectable()
export class TicketTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  generateToken(
    ticket: Pick<Ticket, 'id' | 'tokenNonce' | 'tokenVersion'>,
  ): string {
    if (ticket.tokenVersion !== CURRENT_TOKEN_VERSION) {
      throw new Error(
        `Unsupported Ticket token version: ${ticket.tokenVersion}`,
      );
    }

    const payload = this.payload(
      ticket.tokenVersion,
      ticket.id,
      ticket.tokenNonce,
    );
    return `${payload}.${this.sign(payload).toString('base64url')}`;
  }

  async verifyAndResolveToken(
    token: string,
    client: Pick<Prisma.TransactionClient, 'ticket'> = this.prisma,
  ): Promise<Ticket> {
    const parsed = this.parse(token);
    const expectedSignature = this.sign(parsed.payload);
    const suppliedSignature = Buffer.from(parsed.signature, 'base64url');

    if (
      suppliedSignature.length !== expectedSignature.length ||
      !timingSafeEqual(suppliedSignature, expectedSignature)
    ) {
      throw this.invalidToken();
    }

    const ticket = await client.ticket.findUnique({
      where: { id: parsed.ticketId },
    });
    if (
      !ticket ||
      ticket.tokenVersion !== parsed.version ||
      ticket.tokenNonce !== parsed.nonce
    ) {
      throw this.invalidToken();
    }

    return ticket;
  }

  private parse(token: string): {
    version: number;
    ticketId: string;
    nonce: string;
    signature: string;
    payload: string;
  } {
    if (!token || token.length > MAX_TOKEN_LENGTH) throw this.invalidToken();

    const segments = token.split('.');
    if (segments.length !== 4) throw this.invalidToken();

    const [versionSegment, ticketId, nonce, signature] = segments;
    if (
      versionSegment !== `v${CURRENT_TOKEN_VERSION}` ||
      !ticketId ||
      !UUID_PATTERN.test(ticketId) ||
      !nonce ||
      !NONCE_PATTERN.test(nonce) ||
      !signature ||
      !SIGNATURE_PATTERN.test(signature)
    ) {
      throw this.invalidToken();
    }

    return {
      version: CURRENT_TOKEN_VERSION,
      ticketId,
      nonce,
      signature,
      payload: `${versionSegment}.${ticketId}.${nonce}`,
    };
  }

  private payload(version: number, ticketId: string, nonce: string): string {
    return `v${version}.${ticketId}.${nonce}`;
  }

  private sign(payload: string): Buffer {
    return createHmac('sha256', this.secret()).update(payload).digest();
  }

  private secret(): string {
    const secret = this.config.get<string>('TICKET_TOKEN_SECRET')?.trim();
    if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
      throw new Error(
        'TICKET_TOKEN_SECRET must contain at least 32 bytes of secret material',
      );
    }
    return secret;
  }

  private invalidToken(): UnauthorizedException {
    return new UnauthorizedException('Invalid ticket token');
  }
}
