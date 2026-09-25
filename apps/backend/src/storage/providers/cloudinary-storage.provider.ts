import { randomUUID } from 'node:crypto';
import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  v2 as cloudinary,
  type UploadApiErrorResponse,
  type UploadApiResponse,
} from 'cloudinary';
import type {
  FileStorageProvider,
  StoredImage,
  UploadImageInput,
} from '../storage.types.js';

@Injectable()
export class CloudinaryStorageProvider implements FileStorageProvider {
  private readonly cloudName?: string;
  private readonly apiKey?: string;
  private readonly apiSecret?: string;
  private readonly baseFolder: string;

  constructor(config: ConfigService) {
    this.cloudName = config.get<string>('CLOUDINARY_CLOUD_NAME');
    this.apiKey = config.get<string>('CLOUDINARY_API_KEY');
    this.apiSecret = config.get<string>('CLOUDINARY_API_SECRET');
    this.baseFolder = (
      config.get<string>('CLOUDINARY_FOLDER') ?? 'gobook/services'
    )
      .replace(/^\/+|\/+$/g, '')
      .slice(0, 180);
  }

  async uploadImage(input: UploadImageInput): Promise<StoredImage> {
    this.configure();
    const folder = [this.baseFolder, input.folder]
      .filter((segment): segment is string => Boolean(segment))
      .join('/');

    try {
      const result = await new Promise<UploadApiResponse>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder,
            public_id: randomUUID(),
            resource_type: 'image',
            overwrite: false,
            unique_filename: false,
          },
          (error?: UploadApiErrorResponse, uploaded?: UploadApiResponse) => {
            if (error || !uploaded) {
              reject(
                error ?? new Error('Cloudinary returned no upload result'),
              );
              return;
            }
            resolve(uploaded);
          },
        );
        stream.end(input.buffer);
      });

      if (!result.secure_url.startsWith('https://')) {
        throw new Error('Cloudinary returned a non-HTTPS URL');
      }
      return {
        provider: 'cloudinary',
        storageKey: result.public_id,
        url: result.secure_url,
        width: result.width,
        height: result.height,
        format: result.format,
        bytes: result.bytes,
      };
    } catch {
      throw new BadGatewayException('Image storage upload failed');
    }
  }

  async deleteImage(storageKey: string): Promise<void> {
    this.configure();
    try {
      const result = (await cloudinary.uploader.destroy(storageKey, {
        invalidate: true,
        resource_type: 'image',
      })) as { result?: string };
      if (result.result !== 'ok' && result.result !== 'not found') {
        throw new Error('Cloudinary did not confirm deletion');
      }
    } catch {
      throw new BadGatewayException('Image storage deletion failed');
    }
  }

  private configure(): void {
    if (!this.cloudName || !this.apiKey || !this.apiSecret) {
      throw new ServiceUnavailableException(
        'Cloudinary image storage is not configured',
      );
    }
    cloudinary.config({
      cloud_name: this.cloudName,
      api_key: this.apiKey,
      api_secret: this.apiSecret,
      secure: true,
    });
  }
}
