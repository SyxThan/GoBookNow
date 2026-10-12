import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingStatus, TicketStatus } from '../../generated/prisma/client.js';

export class CustomerTicketBookingItemDto {
  @ApiProperty({ example: 'Workshop Python' })
  serviceTitle: string;

  @ApiProperty({ example: '2026-10-12T02:00:00.000Z' })
  slotStartAt: string;

  @ApiProperty({ example: '2026-10-12T04:00:00.000Z' })
  slotEndAt: string;

  @ApiProperty({ minimum: 1, example: 3 })
  quantity: number;
}

export class CustomerTicketDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'GBT-8F31A920C4D2' })
  ticketCode: string;

  @ApiProperty({ minimum: 1, example: 1 })
  sequenceNo: number;

  @ApiProperty({ enum: TicketStatus, example: TicketStatus.ISSUED })
  status: TicketStatus;

  @ApiProperty({ example: '2026-10-12T02:00:00.000Z' })
  issuedAt: string;

  @ApiPropertyOptional({
    nullable: true,
    example: '2026-10-12T02:30:00.000Z',
  })
  checkedInAt: string | null;

  @ApiProperty({ type: CustomerTicketBookingItemDto })
  bookingItem: CustomerTicketBookingItemDto;
}

export class CustomerTicketListResponseDto {
  @ApiProperty({ format: 'uuid' })
  bookingId: string;

  @ApiProperty({ example: 'GBK-20261012-ABC123' })
  bookingCode: string;

  @ApiProperty({ enum: BookingStatus, example: BookingStatus.CONFIRMED })
  bookingStatus: BookingStatus;

  @ApiProperty({ type: [CustomerTicketDto] })
  tickets: CustomerTicketDto[];
}
