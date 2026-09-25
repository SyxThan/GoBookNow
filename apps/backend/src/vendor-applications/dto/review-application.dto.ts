import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

function trim(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class ApproveVendorApplicationDto {
  @ApiPropertyOptional({ maxLength: 1000 })
  @Transform(({ value }) => trim(value))
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class RejectVendorApplicationDto {
  @ApiProperty({ minLength: 1, maxLength: 1000 })
  @Transform(({ value }) => trim(value))
  @IsString()
  @Length(1, 1000)
  reason!: string;
}
