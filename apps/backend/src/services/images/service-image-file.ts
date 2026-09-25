import { BadRequestException } from '@nestjs/common';

export const MAX_SERVICE_IMAGE_SIZE = 5 * 1024 * 1024;
export const MAX_SERVICE_IMAGES = 8;
export const ALLOWED_SERVICE_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type AllowedServiceImageMimeType =
  (typeof ALLOWED_SERVICE_IMAGE_MIME_TYPES)[number];

export type UploadedServiceImage = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

export function isAllowedServiceImageMimeType(
  mimeType: string,
): mimeType is AllowedServiceImageMimeType {
  return ALLOWED_SERVICE_IMAGE_MIME_TYPES.includes(
    mimeType as AllowedServiceImageMimeType,
  );
}

export function validateUploadedServiceImage(
  file?: UploadedServiceImage,
): asserts file is UploadedServiceImage {
  if (!file) throw new BadRequestException('Image file is required');
  if (!isAllowedServiceImageMimeType(file.mimetype)) {
    throw new BadRequestException(
      'Only JPEG, PNG, and WebP images are allowed',
    );
  }
  if (
    file.size <= 0 ||
    file.size > MAX_SERVICE_IMAGE_SIZE ||
    file.buffer.length <= 0 ||
    file.buffer.length > MAX_SERVICE_IMAGE_SIZE
  ) {
    throw new BadRequestException('Image must be between 1 byte and 5 MB');
  }
  if (!hasValidImageSignature(file)) {
    throw new BadRequestException(
      'Image content does not match its declared type',
    );
  }
}

function hasValidImageSignature(file: UploadedServiceImage): boolean {
  const bytes = file.buffer;
  if (file.mimetype === 'image/jpeg') {
    return (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    );
  }
  if (file.mimetype === 'image/png') {
    return bytes
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (file.mimetype === 'image/webp') {
    return (
      bytes.length >= 12 &&
      bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
      bytes.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  return false;
}
