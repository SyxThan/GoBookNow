import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Allow,
  IsDefined,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class SepayIpnOrderDto {
  @ApiProperty({ example: 'provider-order-id' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  id: string;

  @ApiProperty({ example: 'provider-order-code' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  order_id: string;

  @ApiProperty({ example: 'CAPTURED' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  order_status: string;

  @ApiProperty({ example: 'VND' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(3)
  order_currency: string;

  @ApiProperty({ example: '250000.00' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  order_amount: string;

  @ApiProperty({ example: 'GBK8F2K91AB12CD34EF' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  order_invoice_number: string;

  @IsOptional()
  @Allow()
  custom_data?: unknown;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  user_agent?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  ip_address?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  order_description?: string | null;
}

export class SepayIpnTransactionDto {
  @ApiProperty({ example: 'provider-transaction-row-id' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  id: string;

  @ApiProperty({ example: 'BANK_TRANSFER' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  payment_method: string;

  @ApiProperty({ example: 'provider-transaction-id' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  transaction_id: string;

  @ApiProperty({ example: 'PAYMENT' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  transaction_type: string;

  @ApiProperty({ example: 'APPROVED' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  transaction_status: string;

  @ApiProperty({ example: '250000' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  transaction_amount: string;

  @ApiProperty({ example: 'VND' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(3)
  transaction_currency: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  transaction_date?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  authentication_status?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  card_number?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  card_holder_name?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  card_expiry?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  card_funding_method?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  card_brand?: string | null;
}

export class SepayIpnDto {
  @ApiProperty({ example: 1_757_058_220 })
  @IsInt()
  @Min(0)
  timestamp: number;

  @ApiProperty({ examples: ['ORDER_PAID', 'TRANSACTION_VOID'] })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  notification_type: string;

  @ApiProperty({ type: SepayIpnOrderDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => SepayIpnOrderDto)
  order: SepayIpnOrderDto;

  @ApiProperty({ type: SepayIpnTransactionDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => SepayIpnTransactionDto)
  transaction: SepayIpnTransactionDto;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description: 'Accepted for the provider contract but never persisted.',
  })
  @IsOptional()
  @IsObject()
  customer?: object | null;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description: 'Accepted for the provider contract but never persisted.',
  })
  @IsOptional()
  @IsObject()
  agreement?: object | null;
}
