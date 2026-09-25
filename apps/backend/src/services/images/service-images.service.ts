import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  ServiceStatus,
  VendorStatus,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma/prisma.service.js';
import { FILE_STORAGE_PROVIDER } from '../../storage/storage.constants.js';
import type { FileStorageProvider } from '../../storage/storage.types.js';
import {
  MAX_SERVICE_IMAGES,
  type UploadedServiceImage,
  validateUploadedServiceImage,
} from './service-image-file.js';

const managementImageSelect = {
  id: true,
  url: true,
  originalName: true,
  mimeType: true,
  fileSize: true,
  width: true,
  height: true,
  sortOrder: true,
  isPrimary: true,
  createdAt: true,
} as const satisfies Prisma.ServiceImageSelect;

export type ServiceImageResponse = Prisma.ServiceImageGetPayload<{
  select: typeof managementImageSelect;
}>;

type ServiceClient = Pick<Prisma.TransactionClient, 'service'>;

@Injectable()
export class ServiceImagesService {
  private readonly logger = new Logger(ServiceImagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(FILE_STORAGE_PROVIDER)
    private readonly storage: FileStorageProvider,
  ) {}

  async upload(
    serviceId: string,
    ownerUserId: string,
    candidate?: UploadedServiceImage,
  ): Promise<ServiceImageResponse> {
    validateUploadedServiceImage(candidate);
    await this.assertManageableService(
      this.prisma,
      serviceId,
      ownerUserId,
      true,
    );
    const currentCount = await this.prisma.serviceImage.count({
      where: { serviceId },
    });
    if (currentCount >= MAX_SERVICE_IMAGES) {
      throw this.maximumImagesError();
    }

    const stored = await this.storage.uploadImage({
      buffer: candidate.buffer,
      mimeType: candidate.mimetype,
      originalName: candidate.originalname,
      folder: serviceId,
    });

    try {
      return await this.prisma.$transaction(async (transaction) => {
        await this.lockService(transaction, serviceId);
        await this.assertManageableService(
          transaction,
          serviceId,
          ownerUserId,
          true,
        );
        const count = await transaction.serviceImage.count({
          where: { serviceId },
        });
        if (count >= MAX_SERVICE_IMAGES) {
          throw this.maximumImagesError();
        }
        const order = await transaction.serviceImage.aggregate({
          where: { serviceId },
          _max: { sortOrder: true },
        });
        return transaction.serviceImage.create({
          data: {
            serviceId,
            provider: stored.provider,
            storageKey: stored.storageKey,
            url: stored.url,
            originalName: this.safeOriginalName(candidate.originalname),
            mimeType: candidate.mimetype,
            fileSize: stored.bytes ?? candidate.size,
            width: stored.width,
            height: stored.height,
            sortOrder: (order._max.sortOrder ?? -1) + 1,
            isPrimary: count === 0,
          },
          select: managementImageSelect,
        });
      });
    } catch (error: unknown) {
      try {
        await this.storage.deleteImage(stored.storageKey);
      } catch {
        this.logger.warn(
          `Image upload compensation failed provider=${stored.provider} storageKey=${stored.storageKey} serviceId=${serviceId}`,
        );
      }
      throw error;
    }
  }

  async list(
    serviceId: string,
    ownerUserId: string,
  ): Promise<ServiceImageResponse[]> {
    await this.assertManageableService(
      this.prisma,
      serviceId,
      ownerUserId,
      false,
    );
    return this.prisma.serviceImage.findMany({
      where: { serviceId },
      select: managementImageSelect,
      orderBy: [
        { isPrimary: 'desc' },
        { sortOrder: 'asc' },
        { createdAt: 'asc' },
        { id: 'asc' },
      ],
    });
  }

  async setPrimary(
    serviceId: string,
    imageId: string,
    ownerUserId: string,
  ): Promise<ServiceImageResponse> {
    await this.assertManageableService(
      this.prisma,
      serviceId,
      ownerUserId,
      false,
    );
    return this.prisma.$transaction(async (transaction) => {
      await this.lockService(transaction, serviceId);
      await this.assertManageableService(
        transaction,
        serviceId,
        ownerUserId,
        false,
      );
      const image = await transaction.serviceImage.findFirst({
        where: { id: imageId, serviceId },
        select: { id: true },
      });
      if (!image) throw new NotFoundException('Service image not found');

      await transaction.serviceImage.updateMany({
        where: { serviceId, isPrimary: true },
        data: { isPrimary: false },
      });
      return transaction.serviceImage.update({
        where: { id: imageId },
        data: { isPrimary: true },
        select: managementImageSelect,
      });
    });
  }

  async delete(
    serviceId: string,
    imageId: string,
    ownerUserId: string,
  ): Promise<void> {
    await this.assertManageableService(
      this.prisma,
      serviceId,
      ownerUserId,
      false,
    );
    const image = await this.prisma.serviceImage.findFirst({
      where: { id: imageId, serviceId },
      select: { storageKey: true },
    });
    if (!image) throw new NotFoundException('Service image not found');

    await this.storage.deleteImage(image.storageKey);

    try {
      await this.prisma.$transaction(async (transaction) => {
        await this.lockService(transaction, serviceId);
        const current = await transaction.serviceImage.findFirst({
          where: { id: imageId, serviceId },
          select: { isPrimary: true },
        });
        if (!current) throw new NotFoundException('Service image not found');

        await transaction.serviceImage.delete({ where: { id: imageId } });
        if (current.isPrimary) {
          const next = await transaction.serviceImage.findFirst({
            where: { serviceId },
            orderBy: [
              { sortOrder: 'asc' },
              { createdAt: 'asc' },
              { id: 'asc' },
            ],
            select: { id: true },
          });
          if (next) {
            await transaction.serviceImage.update({
              where: { id: next.id },
              data: { isPrimary: true },
            });
          }
        }
      });
    } catch (error: unknown) {
      this.logger.error(
        `Image metadata deletion failed after remote deletion storageKey=${image.storageKey} serviceId=${serviceId}`,
      );
      throw error;
    }
  }

  private async assertManageableService(
    client: ServiceClient,
    serviceId: string,
    ownerUserId: string,
    requireUploadState: boolean,
  ): Promise<void> {
    const service = await client.service.findFirst({
      where: { id: serviceId, deletedAt: null },
      select: {
        status: true,
        vendor: {
          select: { ownerUserId: true, status: true, deletedAt: true },
        },
      },
    });
    if (!service) throw new NotFoundException('Service not found');
    if (
      service.vendor.ownerUserId !== ownerUserId ||
      service.vendor.status !== VendorStatus.APPROVED ||
      service.vendor.deletedAt
    ) {
      throw new ForbiddenException('Approved owning Vendor is required');
    }
    if (requireUploadState && service.status === ServiceStatus.ARCHIVED) {
      throw new ConflictException('Archived Service cannot accept images');
    }
  }

  private async lockService(
    transaction: Prisma.TransactionClient,
    serviceId: string,
  ): Promise<void> {
    const service = await transaction.service.findUnique({
      where: { id: serviceId },
      select: { updatedAt: true },
    });
    if (!service) throw new NotFoundException('Service not found');

    // A no-op update acquires a PostgreSQL row lock without relying on raw SQL.
    // Keeping updatedAt explicit prevents an image operation from changing the
    // catalog's own last-modified timestamp.
    await transaction.service.update({
      where: { id: serviceId },
      data: { updatedAt: service.updatedAt },
      select: { id: true },
    });
  }

  private safeOriginalName(originalName: string): string | null {
    const normalized = originalName.replaceAll('\\', '/');
    const name = normalized.split('/').at(-1)?.slice(0, 255).trim();
    return name || null;
  }

  private maximumImagesError(): ConflictException {
    return new ConflictException(
      `A Service can contain at most ${MAX_SERVICE_IMAGES} images`,
    );
  }
}
