import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { VendorDocumentType } from '../../generated/prisma/client.js';

export class UploadDocumentDto {
  @ApiProperty({ enum: VendorDocumentType })
  @IsEnum(VendorDocumentType)
  documentType!: VendorDocumentType;
}
