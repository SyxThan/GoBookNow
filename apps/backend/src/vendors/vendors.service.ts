import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, VendorStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma/prisma.service.js';
import type { CreateVendorDto } from './dto/create-vendor.dto.js';
import type { UpdateVendorDto } from './dto/update-vendor.dto.js';
import { addVendorSlugSuffix, createVendorSlug } from './vendor-slug.js';

const vendorResponseSelect = {
  id: true,
  displayName: true,
  slug: true,
  description: true,
  logoUrl: true,
  legalName: true,
  vendorType: true,
  taxCode: true,
  businessRegistrationNumber: true,
  legalRepresentativeName: true,
  contactEmail: true,
  contactPhone: true,
  addressLine: true,
  ward: true,
  district: true,
  province: true,
  countryCode: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.VendorSelect;

export type VendorResponse = Prisma.VendorGetPayload<{
  select: typeof vendorResponseSelect;
}>;

@Injectable()
export class VendorsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    ownerUserId: string,
    dto: CreateVendorDto,
  ): Promise<VendorResponse> {
    const existingVendor = await this.prisma.vendor.findUnique({
      where: { ownerUserId },
      select: { id: true },
    });
    if (existingVendor) {
      throw new ConflictException('User already has a Vendor profile');
    }

    const baseSlug = createVendorSlug(dto.displayName);
    let slug = await this.findAvailableSlug(baseSlug);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.prisma.vendor.create({
          data: {
            ownerUserId,
            slug,
            status: VendorStatus.DRAFT,
            displayName: dto.displayName,
            description: dto.description,
            logoUrl: dto.logoUrl,
            legalName: dto.legalName,
            vendorType: dto.vendorType,
            taxCode: dto.taxCode,
            businessRegistrationNumber: dto.businessRegistrationNumber,
            legalRepresentativeName: dto.legalRepresentativeName,
            contactEmail: dto.contactEmail,
            contactPhone: dto.contactPhone,
            addressLine: dto.addressLine,
            ward: dto.ward,
            district: dto.district,
            province: dto.province,
            countryCode: dto.countryCode,
          },
          select: vendorResponseSelect,
        });
      } catch (error: unknown) {
        if (!this.isUniqueConstraintError(error)) throw error;

        const conflict = await this.findBusinessConflict(ownerUserId, dto);
        if (conflict === 'owner') {
          throw new ConflictException('User already has a Vendor profile');
        }
        if (conflict === 'taxCode') {
          throw new ConflictException('Tax code is already in use');
        }
        if (conflict === 'businessRegistrationNumber') {
          throw new ConflictException(
            'Business registration number is already in use',
          );
        }

        slug = addVendorSlugSuffix(baseSlug, randomUUID().slice(0, 8));
      }
    }

    throw new ConflictException('Could not generate a unique Vendor slug');
  }

  async findMine(ownerUserId: string): Promise<VendorResponse> {
    const vendor = await this.prisma.vendor.findFirst({
      where: { ownerUserId, deletedAt: null },
      select: vendorResponseSelect,
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
    return vendor;
  }

  async findById(id: string): Promise<VendorResponse> {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id, deletedAt: null },
      select: vendorResponseSelect,
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
    return vendor;
  }

  async update(id: string, dto: UpdateVendorDto): Promise<VendorResponse> {
    try {
      return await this.prisma.vendor.update({
        where: { id, deletedAt: null },
        data: dto,
        select: vendorResponseSelect,
      });
    } catch (error: unknown) {
      if (this.isRecordNotFoundError(error)) {
        throw new NotFoundException('Vendor not found');
      }
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(
          'Vendor legal identifier is already in use',
        );
      }
      throw error;
    }
  }

  async softDelete(id: string): Promise<void> {
    const result = await this.prisma.vendor.updateMany({
      where: {
        id,
        deletedAt: null,
        status: { in: [VendorStatus.DRAFT, VendorStatus.REJECTED] },
      },
      data: { deletedAt: new Date() },
    });
    if (result.count === 1) return;

    const vendor = await this.prisma.vendor.findFirst({
      where: { id, deletedAt: null },
      select: { status: true },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');

    throw new ConflictException(
      `Vendor in ${vendor.status} status cannot be deleted`,
    );
  }

  private async findAvailableSlug(baseSlug: string): Promise<string> {
    const existing = await this.prisma.vendor.findUnique({
      where: { slug: baseSlug },
      select: { id: true },
    });
    return existing
      ? addVendorSlugSuffix(baseSlug, randomUUID().slice(0, 8))
      : baseSlug;
  }

  private async findBusinessConflict(
    ownerUserId: string,
    dto: CreateVendorDto,
  ): Promise<'owner' | 'taxCode' | 'businessRegistrationNumber' | null> {
    const conditions: Prisma.VendorWhereInput[] = [{ ownerUserId }];
    if (dto.taxCode) conditions.push({ taxCode: dto.taxCode });
    if (dto.businessRegistrationNumber) {
      conditions.push({
        businessRegistrationNumber: dto.businessRegistrationNumber,
      });
    }

    const vendor = await this.prisma.vendor.findFirst({
      where: { OR: conditions },
      select: {
        ownerUserId: true,
        taxCode: true,
        businessRegistrationNumber: true,
      },
    });
    if (!vendor) return null;
    if (vendor.ownerUserId === ownerUserId) return 'owner';
    if (dto.taxCode && vendor.taxCode === dto.taxCode) return 'taxCode';
    if (
      dto.businessRegistrationNumber &&
      vendor.businessRegistrationNumber === dto.businessRegistrationNumber
    ) {
      return 'businessRegistrationNumber';
    }
    return null;
  }

  private isUniqueConstraintError(
    error: unknown,
  ): error is Prisma.PrismaClientKnownRequestError {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private isRecordNotFoundError(
    error: unknown,
  ): error is Prisma.PrismaClientKnownRequestError {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    );
  }
}
