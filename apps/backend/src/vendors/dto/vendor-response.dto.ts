import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VendorStatus, VendorType } from '../../generated/prisma/client.js';

export class VendorResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  displayName: string;

  @ApiProperty()
  slug: string;

  @ApiPropertyOptional({ nullable: true })
  description: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'uri' })
  logoUrl: string | null;

  @ApiPropertyOptional({ nullable: true })
  legalName: string | null;

  @ApiPropertyOptional({ nullable: true, enum: VendorType })
  vendorType: VendorType | null;

  @ApiPropertyOptional({ nullable: true })
  taxCode: string | null;

  @ApiPropertyOptional({ nullable: true })
  businessRegistrationNumber: string | null;

  @ApiPropertyOptional({ nullable: true })
  legalRepresentativeName: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'email' })
  contactEmail: string | null;

  @ApiPropertyOptional({ nullable: true })
  contactPhone: string | null;

  @ApiPropertyOptional({ nullable: true })
  addressLine: string | null;

  @ApiPropertyOptional({ nullable: true })
  ward: string | null;

  @ApiPropertyOptional({ nullable: true })
  district: string | null;

  @ApiPropertyOptional({ nullable: true })
  province: string | null;

  @ApiProperty({ example: 'VN' })
  countryCode: string;

  @ApiProperty({ enum: VendorStatus })
  status: VendorStatus;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;
}
