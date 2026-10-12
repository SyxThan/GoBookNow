import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import {
  BookingStatus,
  ServiceKind,
  SlotStatus,
  TicketStatus,
} from '../../generated/prisma/client.js';
import { TicketValidationReason } from '../ticket-validation.constants.js';

export const MAX_TICKET_TOKEN_LENGTH = 512;

export class ValidateTicketDto {
  @ApiProperty({
    example: '<opaque-ticket-token>',
    maxLength: MAX_TICKET_TOKEN_LENGTH,
    description:
      'Opaque Ticket credential read from a QR. Clients must not parse it.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_TICKET_TOKEN_LENGTH)
  token: string;
}

export class ValidatedTicketDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'GBT-8F31A920C4D2' })
  ticketCode: string;

  @ApiProperty({ enum: TicketStatus })
  status: TicketStatus;

  @ApiProperty({ minimum: 1 })
  sequenceNo: number;

  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  checkedInAt: string | null;
}

export class ValidatedBookingDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'GBK-20261012-ABC123' })
  bookingCode: string;

  @ApiProperty({ enum: BookingStatus })
  status: BookingStatus;
}

export class ValidatedServiceDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Original Workshop' })
  title: string;

  @ApiProperty({ enum: ServiceKind })
  kind: ServiceKind;
}

export class ValidatedSlotDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'date-time' })
  startAt: string;

  @ApiProperty({ format: 'date-time' })
  endAt: string;

  @ApiProperty({ enum: SlotStatus })
  status: SlotStatus;
}

export class TicketValidationResultDto {
  @ApiProperty()
  authentic: boolean;

  @ApiProperty()
  valid: boolean;

  @ApiProperty()
  checkInEligible: boolean;

  @ApiProperty({ enum: TicketValidationReason })
  reason: TicketValidationReason;

  @ApiPropertyOptional({ type: ValidatedTicketDto })
  ticket?: ValidatedTicketDto;

  @ApiPropertyOptional({ type: ValidatedBookingDto })
  booking?: ValidatedBookingDto;

  @ApiPropertyOptional({ type: ValidatedServiceDto })
  service?: ValidatedServiceDto;

  @ApiPropertyOptional({ type: ValidatedSlotDto })
  slot?: ValidatedSlotDto;
}
