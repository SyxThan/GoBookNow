import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { PaymentAttemptStatus, PaymentProvider, PaymentStatus } from '../../generated/prisma/client.js';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class AdminTransactionFiltersDto {
  @ApiPropertyOptional({ maxLength: 128, description: 'Payment/Attempt UUID, merchantReference or providerTransactionId' })
  @Transform(trim) @IsOptional() @IsString() @MaxLength(128)
  search?: string;

  @ApiPropertyOptional({ maxLength: 30 })
  @Transform(trim) @IsOptional() @IsString() @MaxLength(30)
  bookingCode?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID('4') bookingId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID('4') userId?: string;

  @ApiPropertyOptional({ maxLength: 320 })
  @Transform(trim) @IsOptional() @IsString() @MaxLength(320)
  userEmail?: string;

  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsOptional() @IsEnum(PaymentStatus) paymentStatus?: PaymentStatus;

  @ApiPropertyOptional({ enum: PaymentAttemptStatus })
  @IsOptional() @IsEnum(PaymentAttemptStatus) attemptStatus?: PaymentAttemptStatus;

  @ApiPropertyOptional({ enum: PaymentProvider })
  @IsOptional() @IsEnum(PaymentProvider) provider?: PaymentProvider;

  @ApiPropertyOptional({ description: 'Inclusive Payment.createdAt ISO instant with timezone' })
  @IsOptional() @IsISO8601({ strict: true }) from?: string;

  @ApiPropertyOptional({ description: 'Exclusive Payment.createdAt ISO instant with timezone' })
  @IsOptional() @IsISO8601({ strict: true }) to?: string;
}

export class AdminTransactionsQueryDto extends AdminTransactionFiltersDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;

  @ApiPropertyOptional({ enum: ['newest', 'oldest'] })
  @IsOptional() @IsIn(['newest', 'oldest']) sort?: 'newest' | 'oldest';
}
