import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { VendorApplicationStatus } from '../../generated/prisma/client.js';

export class ListVendorApplicationsDto {
  @ApiPropertyOptional({
    enum: VendorApplicationStatus,
    default: VendorApplicationStatus.PENDING,
  })
  @IsOptional()
  @IsEnum(VendorApplicationStatus)
  status?: VendorApplicationStatus;
}
