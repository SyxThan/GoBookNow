import { describe, expect, it } from 'vitest';
import {
  hasValidDocumentSignature,
  type UploadedDocumentFile,
} from './document-file.js';

function file(mimetype: string, buffer: Buffer): UploadedDocumentFile {
  return { originalname: 'document', mimetype, size: buffer.length, buffer };
}

describe('document signature validation', () => {
  it('accepts PDF, JPEG, and PNG signatures', () => {
    expect(
      hasValidDocumentSignature(
        file('application/pdf', Buffer.from('%PDF-1.7')),
      ),
    ).toBe(true);
    expect(
      hasValidDocumentSignature(
        file('image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0])),
      ),
    ).toBe(true);
    expect(
      hasValidDocumentSignature(
        file(
          'image/png',
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        ),
      ),
    ).toBe(true);
  });

  it('rejects content whose signature does not match its MIME type', () => {
    expect(
      hasValidDocumentSignature(
        file('application/pdf', Buffer.from('MZ executable')),
      ),
    ).toBe(false);
    expect(
      hasValidDocumentSignature(file('image/png', Buffer.from('%PDF-1.7'))),
    ).toBe(false);
  });
});
