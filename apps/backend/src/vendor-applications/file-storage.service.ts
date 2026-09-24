import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { basename, resolve, sep } from 'node:path';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AllowedDocumentMimeType,
  UploadedDocumentFile,
} from './document-file.js';

export type StoredDocument = { storedName: string; originalName: string };

export abstract class FileStorageService {
  abstract save(file: UploadedDocumentFile): Promise<StoredDocument>;
  abstract read(storedName: string): Promise<Buffer>;
  abstract delete(storedName: string): Promise<void>;
}

const EXTENSIONS: Record<AllowedDocumentMimeType, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
};

@Injectable()
export class LocalFileStorageService extends FileStorageService {
  private readonly root: string;

  constructor(config: ConfigService) {
    super();
    const configured = config.get<string>('VENDOR_APPLICATION_UPLOAD_DIR');
    const cwd = process.cwd();
    const defaultRoot = cwd.replaceAll('\\', '/').endsWith('/apps/backend')
      ? resolve(cwd, 'uploads/vendor-applications')
      : resolve(cwd, 'apps/backend/uploads/vendor-applications');
    this.root = resolve(configured ?? defaultRoot);
  }

  async save(file: UploadedDocumentFile): Promise<StoredDocument> {
    await mkdir(this.root, { recursive: true });
    const extension = EXTENSIONS[file.mimetype as AllowedDocumentMimeType];
    const storedName = `${randomUUID()}${extension}`;
    await writeFile(this.safePath(storedName), file.buffer, { flag: 'wx' });
    return {
      storedName,
      originalName: basename(file.originalname).slice(0, 255) || 'document',
    };
  }

  async read(storedName: string): Promise<Buffer> {
    try {
      return await readFile(this.safePath(storedName));
    } catch {
      throw new NotFoundException('Document file not found');
    }
  }

  async delete(storedName: string): Promise<void> {
    try {
      await unlink(this.safePath(storedName));
    } catch {
      // Cleanup is best-effort when a database write fails.
    }
  }

  private safePath(storedName: string): string {
    if (!/^[0-9a-f-]+\.(pdf|jpg|png)$/.test(storedName)) {
      throw new NotFoundException('Document file not found');
    }
    const path = resolve(this.root, storedName);
    if (!path.startsWith(`${this.root}${sep}`)) {
      throw new NotFoundException('Document file not found');
    }
    return path;
  }
}
