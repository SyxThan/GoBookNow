import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CloudinaryStorageProvider } from './providers/cloudinary-storage.provider.js';
import { FILE_STORAGE_PROVIDER } from './storage.constants.js';

@Module({
  imports: [ConfigModule],
  providers: [
    CloudinaryStorageProvider,
    {
      provide: FILE_STORAGE_PROVIDER,
      inject: [ConfigService, CloudinaryStorageProvider],
      useFactory: (
        config: ConfigService,
        provider: CloudinaryStorageProvider,
      ) => {
        const selected =
          config.get<string>('FILE_STORAGE_PROVIDER') ?? 'cloudinary';
        if (selected !== 'cloudinary') {
          throw new Error(`Unsupported FILE_STORAGE_PROVIDER: ${selected}`);
        }
        return provider;
      },
    },
  ],
  exports: [FILE_STORAGE_PROVIDER],
})
export class StorageModule {}
