import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsInt,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export const MAX_BOOKING_HOLD_ITEMS = 10;
export const MAX_BOOKING_HOLD_QUANTITY = 1_000;

export class CreateBookingHoldItemDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'Slot selected by the customer. Service, Vendor, currency, and price are resolved server-side.',
  })
  @IsUUID('4')
  slotId: string;

  @ApiProperty({ minimum: 1, maximum: MAX_BOOKING_HOLD_QUANTITY })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_BOOKING_HOLD_QUANTITY)
  quantity: number;
}

export class CreateBookingHoldDto {
  @ApiProperty({
    type: [CreateBookingHoldItemDto],
    minItems: 1,
    maxItems: MAX_BOOKING_HOLD_ITEMS,
    description:
      'Authoritative hold request. Clients must not send customerId, vendorId, serviceId, price, totals, currency, status, or expiresAt.',
  })
  @ValidateNested({ each: true })
  @Type(() => CreateBookingHoldItemDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BOOKING_HOLD_ITEMS)
  items: CreateBookingHoldItemDto[];
}
