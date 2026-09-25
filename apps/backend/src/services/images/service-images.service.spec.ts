import type { ConfigService } from '@nestjs/config';
import { ServiceStatus, VendorStatus } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../database/prisma/prisma.service.js';
import { CloudinaryStorageProvider } from '../../storage/providers/cloudinary-storage.provider.js';
import type { FileStorageProvider } from '../../storage/storage.types.js';
import type { UploadedServiceImage } from './service-image-file.js';
import { ServiceImagesService } from './service-images.service.js';

const jpeg: UploadedServiceImage = {
  originalname: '../unsafe.jpg',
  mimetype: 'image/jpeg',
  size: 4,
  buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
};

describe('ServiceImagesService', () => {
  it('compensates external upload when the database transaction fails', async () => {
    const databaseError = new Error('database failed');
    const prisma = {
      service: {
        findFirst: vi.fn().mockResolvedValue({
          status: ServiceStatus.DRAFT,
          vendor: {
            ownerUserId: 'owner-1',
            status: VendorStatus.APPROVED,
            deletedAt: null,
          },
        }),
      },
      serviceImage: {
        count: vi.fn().mockResolvedValue(0),
      },
      $transaction: vi.fn().mockRejectedValue(databaseError),
    } as unknown as PrismaService;
    const deleteImage = vi.fn().mockResolvedValue(undefined);
    const storage: FileStorageProvider = {
      uploadImage: vi.fn().mockResolvedValue({
        provider: 'fake',
        storageKey: 'stored-key',
        url: 'https://images.example/test.jpg',
      }),
      deleteImage,
    };
    const service = new ServiceImagesService(prisma, storage);

    await expect(service.upload('service-1', 'owner-1', jpeg)).rejects.toBe(
      databaseError,
    );
    expect(deleteImage).toHaveBeenCalledWith('stored-key');
  });

  it('fails clearly without Cloudinary configuration', async () => {
    const config = {
      get: vi.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;
    const provider = new CloudinaryStorageProvider(config);

    await expect(
      provider.uploadImage({
        buffer: jpeg.buffer,
        mimeType: jpeg.mimetype,
        originalName: jpeg.originalname,
      }),
    ).rejects.toMatchObject({ status: 503 });
  });
});
