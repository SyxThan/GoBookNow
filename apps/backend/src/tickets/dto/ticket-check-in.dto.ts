import { ApiProperty } from '@nestjs/swagger';
import { ServiceKind, TicketStatus } from '../../generated/prisma/client.js';
import { ValidateTicketDto } from './ticket-validation.dto.js';

export class CheckInTicketDto extends ValidateTicketDto {}

export class CheckedInTicketDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'GBT-8F31A920C4D2' })
  ticketCode: string;

  @ApiProperty({ enum: TicketStatus, example: TicketStatus.CHECKED_IN })
  status: TicketStatus;

  @ApiProperty({ minimum: 1 })
  sequenceNo: number;

  @ApiProperty({ format: 'date-time' })
  checkedInAt: string;
}

export class CheckInBookingDto {
  @ApiProperty({ example: 'GBK-20261012-ABC123' })
  bookingCode: string;
}

export class CheckInServiceDto {
  @ApiProperty({ example: 'Original Workshop' })
  title: string;

  @ApiProperty({ enum: ServiceKind })
  kind: ServiceKind;
}

export class CheckInSlotDto {
  @ApiProperty({ format: 'date-time' })
  startAt: string;

  @ApiProperty({ format: 'date-time' })
  endAt: string;
}

export class TicketCheckInResultDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty({ type: CheckedInTicketDto })
  ticket: CheckedInTicketDto;

  @ApiProperty({ type: CheckInBookingDto })
  booking: CheckInBookingDto;

  @ApiProperty({ type: CheckInServiceDto })
  service: CheckInServiceDto;

  @ApiProperty({ type: CheckInSlotDto })
  slot: CheckInSlotDto;
}
