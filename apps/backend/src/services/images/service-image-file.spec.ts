import { BadRequestException } from '@nestjs/common';
import {
  validateUploadedServiceImage,
  type UploadedServiceImage,
} from './service-image-file.js';

function image(mimetype: string, buffer: Buffer): UploadedServiceImage {
  return { originalname: 'image.bin', mimetype, size: buffer.length, buffer };
}

describe('Service image validation', () => {
  it.each([
    ['image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0x00])],
    [
      'image/png',
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ],
    ['image/webp', Buffer.from('RIFF0000WEBP', 'ascii')],
  ])('accepts a valid %s signature', (mimetype, buffer) => {
    expect(() =>
      validateUploadedServiceImage(image(mimetype, buffer)),
    ).not.toThrow();
  });

  it('rejects a MIME/signature mismatch', () => {
    expect(() =>
      validateUploadedServiceImage(
        image('image/jpeg', Buffer.from('not-jpeg')),
      ),
    ).toThrow(BadRequestException);
  });
});
