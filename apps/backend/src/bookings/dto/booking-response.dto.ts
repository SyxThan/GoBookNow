import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BookingStatus,
  PricingSource,
  ReservationStatus,
} from '../../generated/prisma/client.js';

export class BookingReservationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: ReservationStatus, example: ReservationStatus.HELD })
  status: ReservationStatus;

  @ApiPropertyOptional({
    nullable: true,
    example: '2026-09-26T10:10:00.000Z',
  })
  expiresAt: string | null;
}

export class BookingItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  serviceId: string;

  @ApiProperty({ format: 'uuid' })
  slotId: string;

  @ApiProperty({ example: 'Workshop Python' })
  serviceTitle: string;

  @ApiProperty({ example: '2026-10-01T02:00:00.000Z' })
  startAt: string;

  @ApiProperty({ example: '2026-10-01T04:00:00.000Z' })
  endAt: string;

  @ApiProperty({ minimum: 1, example: 2 })
  quantity: number;

  @ApiProperty({ example: '150000', description: 'Integer money string' })
  unitPriceAmount: string;

  @ApiProperty({ example: '300000', description: 'Integer money string' })
  subtotalAmount: string;

  @ApiProperty({ enum: PricingSource, example: PricingSource.SLOT })
  pricingSource: PricingSource;

  @ApiProperty({ type: BookingReservationResponseDto })
  reservation: BookingReservationResponseDto;
}

export class BookingResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'GBK-20260926-ABC123' })
  bookingCode: string;

  @ApiProperty({
    enum: BookingStatus,
    example: BookingStatus.PENDING_PAYMENT,
  })
  status: BookingStatus;

  @ApiProperty({ example: 'VND' })
  currency: string;

  @ApiProperty({ example: '300000', description: 'Integer money string' })
  subtotalAmount: string;

  @ApiProperty({ example: '300000', description: 'Integer money string' })
  totalAmount: string;

  @ApiPropertyOptional({
    nullable: true,
    example: '2026-09-26T10:10:00.000Z',
  })
  expiresAt: string | null;

  @ApiProperty({ type: [BookingItemResponseDto] })
  items: BookingItemResponseDto[];
}
