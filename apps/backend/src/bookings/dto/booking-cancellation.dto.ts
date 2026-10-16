import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import {
  BookingStatus,
  RefundKind,
  RefundStatus,
} from '../../generated/prisma/client.js';

export class CancelBookingDto {
  @ApiPropertyOptional({
    maxLength: 500,
    example: 'Kế hoạch của tôi thay đổi.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reasonNote?: string;
}

export class CancellationPreviewItemDto {
  @ApiProperty({ format: 'uuid' })
  bookingItemId: string;

  @ApiProperty({ example: '300000' })
  originalAmount: string;

  @ApiProperty({ minimum: 0, maximum: 10000, example: 10000 })
  refundBps: number;

  @ApiProperty({ example: '300000' })
  refundAmount: string;

  @ApiProperty({ example: '0' })
  cancellationFeeAmount: string;

  @ApiProperty({ example: true })
  cancellationAllowed: boolean;

  @ApiProperty({
    enum: [
      'FULL_REFUND',
      'PARTIAL_REFUND',
      'NO_REFUND',
      'CANCELLATION_NOT_ALLOWED',
    ],
  })
  reason: string;
}

export class CancellationPreviewResponseDto {
  @ApiProperty({ format: 'uuid' })
  bookingId: string;

  @ApiProperty({ example: true })
  cancellationAllowed: boolean;

  @ApiProperty({
    enum: [
      'FULL_REFUND',
      'PARTIAL_REFUND',
      'NO_REFUND',
      'PARTIAL_CANCELLATION_REQUIRED',
      'CANCELLATION_NOT_ALLOWED',
    ],
  })
  reason: string;

  @ApiProperty({ example: '700000' })
  originalAmount: string;

  @ApiProperty({ example: '400000' })
  refundAmount: string;

  @ApiProperty({ example: '300000' })
  cancellationFeeAmount: string;

  @ApiProperty({ example: 'VND' })
  currency: string;

  @ApiProperty({ example: 1 })
  policyVersion: number;

  @ApiProperty({ type: [CancellationPreviewItemDto] })
  items: CancellationPreviewItemDto[];
}

export class BookingCancellationRefundDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: RefundStatus, example: RefundStatus.PENDING })
  status: RefundStatus;

  @ApiProperty({ enum: RefundKind, example: RefundKind.PARTIAL })
  kind: RefundKind;

  @ApiProperty({ example: '400000' })
  amount: string;

  @ApiProperty({ example: 'VND' })
  currency: string;
}

export class BookingCancellationResultDto {
  @ApiProperty({ format: 'uuid' })
  cancellationId: string;

  @ApiProperty({ format: 'uuid' })
  bookingId: string;

  @ApiProperty({ enum: BookingStatus, example: BookingStatus.CANCELLED })
  bookingStatus: BookingStatus;

  @ApiProperty({ example: '2026-10-16T03:10:00.000Z' })
  requestedAt: string;

  @ApiProperty({ example: '2026-10-16T03:10:00.000Z' })
  cancelledAt: string;

  @ApiProperty({ example: '700000' })
  originalAmount: string;

  @ApiProperty({ example: '400000' })
  refundAmount: string;

  @ApiProperty({ example: '300000' })
  cancellationFeeAmount: string;

  @ApiProperty({ example: 'VND' })
  currency: string;

  @ApiProperty({ example: 1 })
  policyVersion: number;

  @ApiProperty({
    enum: [
      'FULL_REFUND',
      'PARTIAL_REFUND',
      'NO_REFUND',
      'PARTIAL_CANCELLATION_REQUIRED',
      'CANCELLATION_NOT_ALLOWED',
    ],
  })
  reason: string;

  @ApiPropertyOptional({ type: BookingCancellationRefundDto, nullable: true })
  refund: BookingCancellationRefundDto | null;
}
