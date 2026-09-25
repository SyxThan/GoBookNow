import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { VendorApplicationStatus } from '../../generated/prisma/client.js';

export class ListVendorApplicationsDto {
  @ApiPropertyOptional({
    enum: VendorApplicationStatus,
    default: VendorApplicationStatus.PENDING,
  })
  @IsOptional()
  @IsEnum(VendorApplicationStatus)
  status?: VendorApplicationStatus;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
